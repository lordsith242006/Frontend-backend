const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const enablePushBtn = document.getElementById('enable-push');
const disablePushBtn = document.getElementById('disable-push');
const toastDiv = document.getElementById('live-toast');
const socket = typeof io === 'function' ? io() : null;

let certificateCache = null;
let generatedIdCounter = 0;

function setActiveButton(activeId) {
    [homeBtn, aboutBtn].forEach((button) => button.classList.remove('is-active'));
    document.getElementById(activeId)?.classList.add('is-active');
}

function showToast(message, tone = '') {
    if (!toastDiv) {
        return;
    }

    toastDiv.textContent = message;
    toastDiv.className = tone ? `live-toast ${tone}` : 'live-toast';
    toastDiv.hidden = false;

    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
        toastDiv.hidden = true;
        toastDiv.className = 'live-toast';
    }, 3200);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(value) {
    return new Date(value).toLocaleString('ru-RU');
}

function createNoteId() {
    generatedIdCounter += 1;
    return String(Date.now() + generatedIdCounter);
}

function normalizeLegacyNote(note) {
    if (typeof note === 'string') {
        return {
            id: createNoteId(),
            text: note,
            reminder: null
        };
    }

    const normalizedId = note.id ? String(note.id).replace(/\D/g, '') || createNoteId() : createNoteId();
    return {
        id: normalizedId,
        text: note.text || '',
        reminder: note.reminder || null
    };
}

function getStoredNotes() {
    const rawNotes = JSON.parse(localStorage.getItem('notes') || '[]');
    const normalizedNotes = rawNotes.map(normalizeLegacyNote);
    localStorage.setItem('notes', JSON.stringify(normalizedNotes));
    return normalizedNotes;
}

function loadNotesToList(list) {
    const notes = getStoredNotes();

    list.innerHTML = notes.map((note) => {
        const reminderBlock = note.reminder
            ? `<small>Напоминание: ${escapeHtml(formatDate(note.reminder))}</small>`
            : '<small>Обычная задача без времени</small>';

        return `
            <li class="note-card">
                <div class="note-card-row">
                    <div class="note-card-content">
                        <strong>${escapeHtml(note.text)}</strong><br>
                        ${reminderBlock}
                    </div>
                    <button
                        class="action-button action-button--danger note-delete"
                        type="button"
                        data-note-id="${escapeHtml(note.id)}"
                    >
                        Удалить
                    </button>
                </div>
            </li>
        `;
    }).join('');

    if (!notes.length) {
        list.innerHTML = '<li class="note-card"><div class="note-card-content">Пока заметок нет. Добавьте первую задачу или напоминание.</div></li>';
    }
}

function saveNote(note) {
    const notes = getStoredNotes();
    notes.push(note);
    localStorage.setItem('notes', JSON.stringify(notes));
}

async function deleteNote(noteId) {
    const notes = getStoredNotes();
    const note = notes.find((item) => String(item.id) === String(noteId));
    const nextNotes = notes.filter((item) => String(item.id) !== String(noteId));
    localStorage.setItem('notes', JSON.stringify(nextNotes));

    if (note && note.reminder) {
        try {
            await api(`/reminders/${note.id}`, { method: 'DELETE' });
        } catch (error) {
            console.warn('Не удалось отменить напоминание на сервере:', error.message);
        }
    }
}

async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const message = typeof payload === 'string' ? payload : payload.error || 'Ошибка запроса';
        throw new Error(message);
    }

    return payload;
}

async function loadContent(page) {
    try {
        const response = await fetch(`/content/${page}.html`);
        if (!response.ok) {
            throw new Error('Не удалось загрузить страницу');
        }

        const html = await response.text();
        contentDiv.innerHTML = html;

        if (page === 'home') {
            initNotes();
        }

        if (page === 'about') {
            initAbout();
        }
    } catch (error) {
        contentDiv.innerHTML = '<p class="text-error">Ошибка загрузки страницы.</p>';
        console.error(error);
        showToast('Не удалось загрузить страницу.', 'error');
    }
}

function loadHome() {
    setActiveButton('home-btn');
    loadContent('home');
}

function loadAbout() {
    setActiveButton('about-btn');
    loadContent('about');
}

homeBtn?.addEventListener('click', loadHome);
aboutBtn?.addEventListener('click', loadAbout);

function initNotes() {
    const form = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const reminderForm = document.getElementById('reminder-form');
    const reminderText = document.getElementById('reminder-text');
    const reminderTime = document.getElementById('reminder-time');
    const list = document.getElementById('notes-list');

    if (!form || !input || !reminderForm || !reminderText || !reminderTime || !list) {
        return;
    }

    reminderTime.min = new Date().toISOString().slice(0, 16);
    loadNotesToList(list);

    list.addEventListener('click', async (event) => {
        const button = event.target.closest('.note-delete');
        if (!button) {
            return;
        }

        await deleteNote(button.dataset.noteId);
        loadNotesToList(list);
        showToast('Заметка удалена.', 'success');
    });

    function addNote(text, reminderTimestamp = null) {
        const newNote = {
            id: createNoteId(),
            text,
            reminder: reminderTimestamp
        };

        saveNote(newNote);
        loadNotesToList(list);

        if (socket) {
            if (reminderTimestamp) {
                socket.emit('newReminder', {
                    id: newNote.id,
                    text,
                    reminderTime: reminderTimestamp
                });
            } else {
                socket.emit('newTask', {
                    text,
                    timestamp: Date.now()
                });
            }
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = input.value.trim();

        if (!text) {
            return;
        }

        addNote(text);
        input.value = '';
        showToast('Задача сохранена и отправлена.', 'success');
    });

    reminderForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const text = reminderText.value.trim();
        const datetime = reminderTime.value;

        if (!text || !datetime) {
            return;
        }

        const timestamp = new Date(datetime).getTime();
        if (timestamp <= Date.now()) {
            showToast('Напоминание нужно поставить на будущее время.', 'error');
            return;
        }

        addNote(text, timestamp);
        reminderText.value = '';
        reminderTime.value = '';
        showToast('Напоминание сохранено.', 'success');
    });
}

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; index += 1) {
        outputArray[index] = rawData.charCodeAt(index);
    }

    return outputArray;
}

function updatePushButtons(enabled) {
    if (!enablePushBtn || !disablePushBtn) {
        return;
    }

    enablePushBtn.hidden = enabled;
    disablePushBtn.hidden = !enabled;
}

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            const publicKey = await api('/vapidPublicKey');
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }

        await api('/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription)
        });

        updatePushButtons(true);
        showToast('Подписка на уведомления включена.', 'success');
    } catch (error) {
        console.error('Ошибка подписки на push:', error);
        showToast('Не удалось включить уведомления.', 'error');
    }
}

async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            await api('/unsubscribe', {
                method: 'POST',
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            await subscription.unsubscribe();
        }

        updatePushButtons(false);
        showToast('Уведомления отключены.', 'success');
    } catch (error) {
        console.error('Ошибка отписки от push:', error);
        showToast('Не удалось отключить уведомления.', 'error');
    }
}

async function initPushControls() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const existingSubscription = await registration.pushManager.getSubscription();

        if (existingSubscription) {
            await api('/subscribe', {
                method: 'POST',
                body: JSON.stringify(existingSubscription)
            });
        }

        updatePushButtons(Boolean(existingSubscription));
    } catch (error) {
        console.error('Не удалось зарегистрировать service worker:', error);
    }
}

async function initAbout() {
    try {
        if (!certificateCache) {
            certificateCache = await api('/api/https/certificate');
        }

        document.getElementById('about-origin').textContent = window.location.origin;
        document.getElementById('about-subject').textContent = certificateCache.subject || '-';
        document.getElementById('about-issuer').textContent = certificateCache.issuer || '-';
        document.getElementById('about-valid-from').textContent = certificateCache.validFrom
            ? formatDate(certificateCache.validFrom)
            : '-';
        document.getElementById('about-valid-to').textContent = certificateCache.validTo
            ? formatDate(certificateCache.validTo)
            : '-';
        document.getElementById('about-fingerprint').textContent = certificateCache.fingerprint256 || '-';
        document.getElementById('certificate-pem').textContent = certificateCache.pem || 'Сертификат недоступен';
    } catch (error) {
        console.error('Не удалось загрузить сертификат:', error);
        showToast('Не удалось загрузить данные HTTPS.', 'error');
    }
}

enablePushBtn?.addEventListener('click', async () => {
    if (Notification.permission === 'denied') {
        showToast('Уведомления запрещены в настройках браузера.', 'error');
        return;
    }

    if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            showToast('Для работы push нужно разрешить уведомления.', 'error');
            return;
        }
    }

    await subscribeToPush();
});

disablePushBtn?.addEventListener('click', async () => {
    await unsubscribeFromPush();
});

if (socket) {
    socket.on('connect', () => {
        console.log('Клиент подключён:', socket.id);
    });

    socket.on('taskAdded', (task) => {
        if (task?.text) {
            showToast(`Новая задача: ${task.text}`, 'success');
        }
    });
}

window.addEventListener('load', async () => {
    await initPushControls();
});

loadHome();
