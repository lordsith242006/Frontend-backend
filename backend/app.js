const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ACCESS_SECRET = process.env.ACCESS_SECRET || 'practice_7_12_access_secret';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'practice_7_12_refresh_secret';
const ACCESS_EXPIRES_IN = process.env.ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN || '7d';
const VALID_ROLES = ['admin', 'moderator', 'user'];
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3001';
const UPLOAD_LIMIT_BYTES = Number(process.env.UPLOAD_LIMIT_BYTES || 5 * 1024 * 1024);
const databasePath = path.resolve(__dirname, process.env.DATABASE_PATH || 'practice-7-12.sqlite');
const db = new sqlite3.Database(databasePath);

app.use(express.json());
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true
  })
);

const imagesDirectory = path.join(__dirname, '../frontend/public/images');
fs.mkdirSync(imagesDirectory, { recursive: true });

function sanitizeFilename(filename = 'image') {
  const normalized = path
    .basename(filename)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'image';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesDirectory),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${sanitizeFilename(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: {
    fileSize: UPLOAD_LIMIT_BYTES
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) {
      const error = new Error('Разрешена загрузка только изображений');
      error.statusCode = 400;
      cb(error);
      return;
    }

    cb(null, true);
  }
});

app.use('/images', express.static(imagesDirectory));

const demoUsers = [
  { id: 'u-admin', username: 'admin', password: 'admin123', role: 'admin' },
  { id: 'u-moderator', username: 'moderator', password: 'mod12345', role: 'moderator' },
  { id: 'u-user', username: 'user', password: 'user12345', role: 'user' }
];

const demoProducts = [
  {
    id: nanoid(8),
    title: 'RTX 4090 Founders Edition',
    category: 'GPU',
    price: 185000,
    stock: 4,
    rating: 4.9,
    description: 'Флагманская видеокарта для 4K-гейминга и тяжелого рендеринга.',
    image: '/images/rtx4090.png',
    createdBy: 'u-admin'
  },
  {
    id: nanoid(8),
    title: 'Ryzen 7 7800X3D',
    category: 'CPU',
    price: 45000,
    stock: 9,
    rating: 4.8,
    description: 'Игровой процессор с 3D V-Cache и высокой энергоэффективностью.',
    image: '/images/r7.png',
    createdBy: 'u-moderator'
  },
  {
    id: nanoid(8),
    title: 'Samsung 990 PRO 2TB',
    category: 'SSD',
    price: 22000,
    stock: 12,
    rating: 4.7,
    description: 'Быстрый NVMe Gen4 SSD для системы, игр и рабочих проектов.',
    image: '/images/ssd.png',
    createdBy: 'u-admin'
  },
  {
    id: nanoid(8),
    title: 'Intel Core i9-14900K',
    category: 'CPU',
    price: 62000,
    stock: 6,
    rating: 4.8,
    description: 'Мощный процессор для игр, стриминга и многопоточных задач.',
    image: '/images/i9.png',
    createdBy: 'u-admin'
  },
  {
    id: nanoid(8),
    title: 'Kingston Fury Beast 32GB',
    category: 'RAM',
    price: 13000,
    stock: 15,
    rating: 4.6,
    description: 'Комплект DDR5 для современных сборок со стабильными XMP-профилями.',
    image: '/images/ram.png',
    createdBy: 'u-moderator'
  },
  {
    id: nanoid(8),
    title: 'RTX 4070 Ti Super',
    category: 'GPU',
    price: 95000,
    stock: 7,
    rating: 4.7,
    description: 'Сбалансированная видеокарта для 1440p и рабочих задач.',
    image: '/images/rtx4070.png',
    createdBy: 'u-admin'
  }
];

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        lastID: this.lastID,
        changes: this.changes
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function initializeDatabase() {
  await exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL,
      rating REAL NOT NULL,
      description TEXT NOT NULL,
      image TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS refresh_sessions (
      jti TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      user_id TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS blacklisted_access_tokens (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blacklisted_refresh_tokens (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
  `);

  const usersCount = await get('SELECT COUNT(*) AS count FROM users');
  if (!usersCount || usersCount.count === 0) {
    for (const user of demoUsers) {
      const createdAt = new Date().toISOString();
      const passwordHash = bcrypt.hashSync(user.password, 10);
      await run(
        `
          INSERT INTO users (id, username, password_hash, role, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        [user.id, user.username, passwordHash, user.role, createdAt]
      );
    }
  }

  const productsCount = await get('SELECT COUNT(*) AS count FROM products');
  if (!productsCount || productsCount.count === 0) {
    for (const product of demoProducts) {
      await run(
        `
          INSERT INTO products (
            id, title, category, price, stock, rating, description,
            image, created_by, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          product.id,
          product.title,
          product.category,
          product.price,
          product.stock,
          product.rating,
          product.description,
          product.image,
          product.createdBy,
          new Date().toISOString(),
          null
        ]
      );
    }
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.created_at
  };
}

function normalizeUserSummary(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    productsCreated: Number(row.products_created || 0),
    activeSessions: Number(row.active_sessions || 0)
  };
}

function normalizeProduct(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    price: Number(row.price),
    stock: Number(row.stock),
    rating: Number(row.rating),
    description: row.description,
    image: row.image,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createTokenPayload(user) {
  return {
    sub: user.id,
    username: user.username,
    role: user.role
  };
}

function issueAccessToken(user) {
  const jti = nanoid(12);
  const token = jwt.sign(createTokenPayload(user), ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
    jwtid: jti
  });

  return { token, jti };
}

function issueRefreshToken(user) {
  const jti = nanoid(12);
  const token = jwt.sign(createTokenPayload(user), REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
    jwtid: jti
  });

  return { token, jti };
}

async function cleanupExpiredBlacklist() {
  const now = Date.now();
  await run('DELETE FROM blacklisted_access_tokens WHERE expires_at <= ?', [now]);
  await run('DELETE FROM blacklisted_refresh_tokens WHERE expires_at <= ?', [now]);
}

async function addTokenToBlacklist(tableName, decodedToken) {
  if (!decodedToken?.jti || !decodedToken?.exp) {
    return;
  }

  await run(`INSERT OR REPLACE INTO ${tableName} (jti, expires_at) VALUES (?, ?)`, [
    decodedToken.jti,
    decodedToken.exp * 1000
  ]);
}

function getBearerToken(headerValue = '') {
  const [scheme, token] = headerValue.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function getRefreshToken(req) {
  const headerValue = req.headers['x-refresh-token'] || req.headers['refresh-token'];
  if (!headerValue || Array.isArray(headerValue)) {
    return null;
  }

  return headerValue.trim() || null;
}

function validateProductPayload(body, isPartial = false) {
  const errors = [];
  const requiredFields = ['title', 'category', 'price', 'stock', 'description'];
  const fieldLabels = {
    title: 'название',
    category: 'категория',
    price: 'цена',
    stock: 'остаток',
    description: 'описание'
  };

  if (!isPartial) {
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        errors.push(`Поле «${fieldLabels[field] || field}» обязательно`);
      }
    }
  }

  if (body.title !== undefined && String(body.title).trim().length < 3) {
    errors.push('Название должно содержать минимум 3 символа');
  }

  if (body.category !== undefined && String(body.category).trim().length < 2) {
    errors.push('Категория должна содержать минимум 2 символа');
  }

  if (body.price !== undefined && (!Number.isFinite(Number(body.price)) || Number(body.price) <= 0)) {
    errors.push('Цена должна быть больше нуля');
  }

  if (body.stock !== undefined && (!Number.isInteger(Number(body.stock)) || Number(body.stock) < 0)) {
    errors.push('Остаток должен быть целым числом от 0');
  }

  if (
    body.rating !== undefined &&
    (!Number.isFinite(Number(body.rating)) || Number(body.rating) < 0 || Number(body.rating) > 5)
  ) {
    errors.push('Рейтинг должен быть от 0 до 5');
  }

  if (body.description !== undefined && String(body.description).trim().length < 10) {
    errors.push('Описание должно содержать минимум 10 символов');
  }

  return errors;
}

function buildProductsQuery(query) {
  const filters = [];
  const params = [];
  const normalizedSearch = String(query.search || '')
    .trim()
    .toLowerCase();
  const normalizedCategory = String(query.category || '').trim();

  if (normalizedSearch) {
    const searchLike = `%${normalizedSearch}%`;
    filters.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    params.push(searchLike, searchLike);
  }

  if (normalizedCategory && normalizedCategory !== 'all') {
    filters.push('category = ?');
    params.push(normalizedCategory);
  }

  let orderBy = 'ORDER BY datetime(created_at) DESC';
  if (query.sort === 'price_asc') {
    orderBy = 'ORDER BY price ASC, datetime(created_at) DESC';
  } else if (query.sort === 'price_desc') {
    orderBy = 'ORDER BY price DESC, datetime(created_at) DESC';
  } else if (query.sort === 'stock_asc') {
    orderBy = 'ORDER BY stock ASC, datetime(created_at) DESC';
  } else if (query.sort === 'stock_desc') {
    orderBy = 'ORDER BY stock DESC, datetime(created_at) DESC';
  } else if (query.sort === 'rating_desc') {
    orderBy = 'ORDER BY rating DESC, datetime(created_at) DESC';
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  return {
    sql: `SELECT * FROM products ${whereClause} ${orderBy}`,
    params
  };
}

async function authMiddleware(req, res, next) {
  await cleanupExpiredBlacklist();

  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ error: 'Отсутствует или некорректен заголовок Authorization' });
  }

  try {
    const payload = jwt.verify(token, ACCESS_SECRET);
    const revoked = await get('SELECT jti FROM blacklisted_access_tokens WHERE jti = ?', [payload.jti]);
    if (revoked) {
      return res.status(401).json({ error: 'Токен отозван' });
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = {
      ...payload,
      token,
      user
    };

    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Недействительный или просроченный access-токен' });
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    return next();
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: databasePath,
    demoUsers: demoUsers.map(({ password, ...user }) => user),
    credentials: ['admin / admin123', 'moderator / mod12345', 'user / user12345']
  });
});

app.post('/api/upload', authMiddleware, authorizeRoles('admin', 'moderator'), upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Нужно выбрать файл изображения' });
  }

  return res.status(201).json({
    imageUrl: `/images/${req.file.filename}`
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  if (role && role !== 'user') {
    return res.status(403).json({ error: 'Самостоятельная регистрация доступна только для обычного пользователя' });
  }

  const selectedRole = 'user';
  const existingUser = await get('SELECT id FROM users WHERE username = ?', [normalizedUsername]);

  if (existingUser) {
    return res.status(409).json({ error: 'Пользователь с таким логином уже существует' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: nanoid(8),
    username: normalizedUsername,
    role: selectedRole,
    createdAt: new Date().toISOString()
  };

  await run(
    `
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [user.id, user.username, passwordHash, user.role, user.createdAt]
  );

  return res.status(201).json({
    message: 'Пользователь создан',
    user
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }

  const normalizedUsername = String(username).trim().toLowerCase();
  const user = await get('SELECT * FROM users WHERE username = ?', [normalizedUsername]);

  if (!user) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const access = issueAccessToken(user);
  const refresh = issueRefreshToken(user);

  await run(
    `
      INSERT OR REPLACE INTO refresh_sessions (jti, token, user_id)
      VALUES (?, ?, ?)
    `,
    [refresh.jti, refresh.token, user.id]
  );

  return res.json({
    accessToken: access.token,
    refreshToken: refresh.token,
    user: publicUser(user)
  });
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = getRefreshToken(req);

  if (!refreshToken) {
    return res.status(400).json({ error: 'Нужен refresh-токен в заголовке' });
  }

  try {
    const payload = jwt.verify(refreshToken, REFRESH_SECRET);
    const revoked = await get('SELECT jti FROM blacklisted_refresh_tokens WHERE jti = ?', [payload.jti]);
    if (revoked) {
      return res.status(401).json({ error: 'Refresh-токен отозван' });
    }

    const session = await get('SELECT * FROM refresh_sessions WHERE jti = ?', [payload.jti]);
    if (!session || session.token !== refreshToken) {
      return res.status(401).json({ error: 'Недействительный refresh-токен' });
    }

    const user = await get('SELECT * FROM users WHERE id = ?', [payload.sub]);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    await run('DELETE FROM refresh_sessions WHERE jti = ?', [payload.jti]);
    await addTokenToBlacklist('blacklisted_refresh_tokens', payload);

    const access = issueAccessToken(user);
    const refresh = issueRefreshToken(user);

    await run(
      `
        INSERT OR REPLACE INTO refresh_sessions (jti, token, user_id)
        VALUES (?, ?, ?)
      `,
      [refresh.jti, refresh.token, user.id]
    );

    return res.json({
      accessToken: access.token,
      refreshToken: refresh.token
    });
  } catch (error) {
    return res.status(401).json({ error: 'Недействительный или просроченный refresh-токен' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    user: publicUser(req.user.user)
  });
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  const refreshToken = getRefreshToken(req);

  await addTokenToBlacklist('blacklisted_access_tokens', req.user);

  if (refreshToken) {
    try {
      const refreshPayload = jwt.verify(refreshToken, REFRESH_SECRET);
      await run('DELETE FROM refresh_sessions WHERE jti = ?', [refreshPayload.jti]);
      await addTokenToBlacklist('blacklisted_refresh_tokens', refreshPayload);
    } catch (error) {
      // Ignore invalid refresh token on logout.
    }
  }

  return res.json({ message: 'Выход выполнен' });
});

app.get('/api/auth/blacklist', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  const [accessRevoked, refreshRevoked, activeRefreshSessions] = await Promise.all([
    get('SELECT COUNT(*) AS count FROM blacklisted_access_tokens'),
    get('SELECT COUNT(*) AS count FROM blacklisted_refresh_tokens'),
    get('SELECT COUNT(*) AS count FROM refresh_sessions')
  ]);

  return res.json({
    accessRevoked: accessRevoked.count,
    refreshRevoked: refreshRevoked.count,
    activeRefreshSessions: activeRefreshSessions.count
  });
});

app.get('/api/users', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  const rows = await all(
    `
      SELECT
        users.id,
        users.username,
        users.role,
        users.created_at,
        COUNT(DISTINCT products.id) AS products_created,
        COUNT(DISTINCT refresh_sessions.jti) AS active_sessions
      FROM users
      LEFT JOIN products ON products.created_by = users.id
      LEFT JOIN refresh_sessions ON refresh_sessions.user_id = users.id
      GROUP BY users.id, users.username, users.role, users.created_at
      ORDER BY
        CASE users.role
          WHEN 'admin' THEN 0
          WHEN 'moderator' THEN 1
          ELSE 2
        END,
        datetime(users.created_at) ASC
    `
  );

  return res.json(rows.map(normalizeUserSummary));
});

app.get('/api/products', authMiddleware, async (req, res) => {
  const { sql, params } = buildProductsQuery(req.query);
  const rows = await all(sql, params);
  return res.json(rows.map(normalizeProduct));
});

app.get('/api/products/:id', authMiddleware, async (req, res) => {
  const product = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) {
    return res.status(404).json({ error: 'Товар не найден' });
  }

  return res.json(normalizeProduct(product));
});

app.post('/api/products', authMiddleware, authorizeRoles('admin', 'moderator'), async (req, res) => {
  const errors = validateProductPayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const product = {
    id: nanoid(8),
    title: String(req.body.title).trim(),
    category: String(req.body.category).trim(),
    price: Number(req.body.price),
    stock: Number(req.body.stock),
    rating: req.body.rating !== undefined ? Number(req.body.rating) : 0,
    description: String(req.body.description).trim(),
    image: req.body.image ? String(req.body.image).trim() : '/images/rtx4090.png',
    createdBy: req.user.sub,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };

  await run(
    `
      INSERT INTO products (
        id, title, category, price, stock, rating, description,
        image, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      product.id,
      product.title,
      product.category,
      product.price,
      product.stock,
      product.rating,
      product.description,
      product.image,
      product.createdBy,
      product.createdAt,
      product.updatedAt
    ]
  );

  return res.status(201).json(product);
});

app.put('/api/products/:id', authMiddleware, authorizeRoles('admin', 'moderator'), async (req, res) => {
  const existing = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Товар не найден' });
  }

  const errors = validateProductPayload(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(', ') });
  }

  const nextProduct = {
    title: req.body.title !== undefined ? String(req.body.title).trim() : existing.title,
    category: req.body.category !== undefined ? String(req.body.category).trim() : existing.category,
    price: req.body.price !== undefined ? Number(req.body.price) : Number(existing.price),
    stock: req.body.stock !== undefined ? Number(req.body.stock) : Number(existing.stock),
    rating: req.body.rating !== undefined ? Number(req.body.rating) : Number(existing.rating),
    description: req.body.description !== undefined ? String(req.body.description).trim() : existing.description,
    image: req.body.image !== undefined ? String(req.body.image).trim() : existing.image,
    updatedAt: new Date().toISOString()
  };

  await run(
    `
      UPDATE products
      SET title = ?, category = ?, price = ?, stock = ?, rating = ?,
          description = ?, image = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      nextProduct.title,
      nextProduct.category,
      nextProduct.price,
      nextProduct.stock,
      nextProduct.rating,
      nextProduct.description,
      nextProduct.image,
      nextProduct.updatedAt,
      req.params.id
    ]
  );

  return res.json(
    normalizeProduct({
      ...existing,
      title: nextProduct.title,
      category: nextProduct.category,
      price: nextProduct.price,
      stock: nextProduct.stock,
      rating: nextProduct.rating,
      description: nextProduct.description,
      image: nextProduct.image,
      updated_at: nextProduct.updatedAt
    })
  );
});

app.delete('/api/products/:id', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  const product = await get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!product) {
    return res.status(404).json({ error: 'Товар не найден' });
  }

  await run('DELETE FROM products WHERE id = ?', [req.params.id]);
  return res.json({ message: 'Товар удален', product: normalizeProduct(product) });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Изображение слишком большое. Максимальный размер: ${UPLOAD_LIMIT_BYTES} байт` });
    }

    return res.status(400).json({ error: error.message });
  }

  if (error?.statusCode) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error('Unhandled error', error);
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
      console.log(`SQLite database: ${databasePath}`);
      console.log('Demo users: admin/admin123, moderator/mod12345, user/user12345');
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
