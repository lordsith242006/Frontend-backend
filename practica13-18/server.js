const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const webPush = require('web-push');
const selfsigned = require('selfsigned');
const { X509Certificate } = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const GENERATED_CERT_PATH = path.join(__dirname, 'cert.json');
const MKCERT_CERT_PATH = path.join(__dirname, 'localhost.pem');
const MKCERT_KEY_PATH = path.join(__dirname, 'localhost-key.pem');
const VAPID_PATH = path.join(__dirname, 'vapid.json');

let vapidKeys;
let certificateInfo;
let subscriptions = [];
const reminders = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.warn(`Cannot parse ${path.basename(filePath)}:`, error.message);
        return null;
    }
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function loadOrCreateVapidKeys() {
    const existing = readJson(VAPID_PATH);
    if (existing && existing.publicKey && existing.privateKey) {
        return existing;
    }

    const generated = webPush.generateVAPIDKeys();
    writeJson(VAPID_PATH, generated);
    return generated;
}

async function generateSelfSignedCertificate() {
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const notBeforeDate = new Date();
    const notAfterDate = new Date(notBeforeDate);
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 1);

    const generated = await selfsigned.generate(attrs, {
        algorithm: 'sha256',
        keySize: 2048,
        notBeforeDate,
        notAfterDate,
        extensions: [
            { name: 'basicConstraints', cA: false, critical: true },
            { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
            { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
            {
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: 'localhost' },
                    { type: 7, ip: '127.0.0.1' },
                    { type: 7, ip: '::1' }
                ]
            }
        ]
    });

    const bundle = {
        key: generated.private,
        cert: generated.cert,
        source: 'selfsigned',
        createdAt: new Date().toISOString()
    };

    writeJson(GENERATED_CERT_PATH, bundle);
    return bundle;
}

async function loadHttpsCredentials() {
    if (fs.existsSync(MKCERT_CERT_PATH) && fs.existsSync(MKCERT_KEY_PATH)) {
        return {
            key: fs.readFileSync(MKCERT_KEY_PATH, 'utf8'),
            cert: fs.readFileSync(MKCERT_CERT_PATH, 'utf8'),
            source: 'mkcert',
            createdAt: null
        };
    }

    const existing = readJson(GENERATED_CERT_PATH);
    if (existing && existing.key && existing.cert) {
        return existing;
    }

    return generateSelfSignedCertificate();
}

function buildCertificateInfo(credentials) {
    const x509 = new X509Certificate(credentials.cert);
    return {
        subject: x509.subject,
        issuer: x509.issuer,
        validFrom: new Date(x509.validFrom).toISOString(),
        validTo: new Date(x509.validTo).toISOString(),
        fingerprint256: x509.fingerprint256,
        source: credentials.source,
        createdAt: credentials.createdAt || null,
        pem: credentials.cert
    };
}

function sendPushToSubscriptions(payload) {
    subscriptions.forEach((subscription) => {
        webPush.sendNotification(subscription, JSON.stringify(payload)).catch((error) => {
            console.error('Push error:', error.message);
            if (error.statusCode === 404 || error.statusCode === 410) {
                subscriptions = subscriptions.filter((item) => item.endpoint !== subscription.endpoint);
            }
        });
    });
}

function scheduleReminder({ id, text, reminderTime }) {
    const delay = reminderTime - Date.now();
    if (delay <= 0) {
        return false;
    }

    if (reminders.has(id)) {
        clearTimeout(reminders.get(id).timeoutId);
    }

    const timeoutId = setTimeout(() => {
        sendPushToSubscriptions({
            title: '!!! Напоминание',
            body: text,
            reminderId: id
        });
        reminders.delete(id);
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime });
    return true;
}

app.get('/vapidPublicKey', (req, res) => {
    res.type('text/plain').send(vapidKeys.publicKey);
});

app.get('/api/status', (req, res) => {
    res.json({
        origin: `https://localhost:${PORT}`,
        subscriptionCount: subscriptions.length,
        reminderCount: reminders.size,
        certificate: certificateInfo
    });
});

app.get('/api/https/certificate', (req, res) => {
    res.json(certificateInfo);
});

app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
        res.status(400).json({ error: 'Некорректная подписка' });
        return;
    }

    subscriptions = subscriptions.filter((item) => item.endpoint !== subscription.endpoint);
    subscriptions.push(subscription);
    res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
    const { endpoint } = req.body || {};
    subscriptions = subscriptions.filter((item) => item.endpoint !== endpoint);
    res.status(200).json({ message: 'Подписка удалена' });
});

app.post('/snooze', (req, res) => {
    const reminderId = parseInt(req.query.reminderId, 10);
    if (!reminderId || !reminders.has(reminderId)) {
        res.status(404).json({ error: 'Reminder not found' });
        return;
    }

    const reminder = reminders.get(reminderId);
    clearTimeout(reminder.timeoutId);

    const newDelay = 5 * 60 * 1000;
    const newTimeoutId = setTimeout(() => {
        sendPushToSubscriptions({
            title: 'Напоминание отложено',
            body: reminder.text,
            reminderId
        });
        reminders.delete(reminderId);
    }, newDelay);

    reminders.set(reminderId, {
        timeoutId: newTimeoutId,
        text: reminder.text,
        reminderTime: Date.now() + newDelay
    });

    res.status(200).json({ message: 'Reminder snoozed for 5 minutes' });
});

app.delete('/reminders/:id', (req, res) => {
    const reminderId = Number(req.params.id);
    if (!reminderId || !reminders.has(reminderId)) {
        res.status(404).json({ error: 'Reminder not found' });
        return;
    }

    const reminder = reminders.get(reminderId);
    clearTimeout(reminder.timeoutId);
    reminders.delete(reminderId);

    res.status(200).json({ message: 'Reminder cancelled' });
});

async function start() {
    const credentials = await loadHttpsCredentials();
    certificateInfo = buildCertificateInfo(credentials);
    vapidKeys = loadOrCreateVapidKeys();

    webPush.setVapidDetails(
        'mailto:offline-notes@example.com',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );

    const server = https.createServer(
        {
            key: credentials.key,
            cert: credentials.cert
        },
        app
    );

    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log('Клиент подключён:', socket.id);

        socket.on('newTask', (task) => {
            io.emit('taskAdded', task);
            sendPushToSubscriptions({
                title: 'Новая задача',
                body: task.text
            });
        });

        socket.on('newReminder', (reminder) => {
            const { id, text, reminderTime } = reminder;
            scheduleReminder({
                id: Number(id),
                text,
                reminderTime: Number(reminderTime)
            });
        });

        socket.on('disconnect', () => {
            console.log('Клиент отключён:', socket.id);
        });
    });

    server.listen(PORT, () => {
        console.log(`Сервер запущен на https://localhost:${PORT}`);
    });
}

start().catch((error) => {
    console.error('Cannot start server:', error);
    process.exit(1);
});
