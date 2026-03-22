const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const backendDir = path.resolve(__dirname, '..');
const port = Number(process.env.SMOKE_TEST_PORT || 3100);
const baseUrl = `http://localhost:${port}`;
const databaseFilename = 'smoke-test.sqlite';
const databasePath = path.join(backendDir, databaseFilename);

if (fs.existsSync(databasePath)) {
  fs.unlinkSync(databasePath);
}

const child = spawn(process.execPath, ['app.js'], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_PATH: databaseFilename
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let createdAdminProductId = null;
let adminAccessToken = null;
let stdout = '';
let stderr = '';

child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

async function waitForServer(timeoutMs = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Ignore until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Backend did not start on ${baseUrl}`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }
  }

  return {
    status: response.status,
    data
  };
}

async function cleanup() {
  try {
    if (createdAdminProductId && adminAccessToken) {
      await request(`/api/products/${createdAdminProductId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminAccessToken}`
        }
      });
    }
  } catch (error) {
    // Best-effort cleanup only.
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (!child.killed) {
    child.kill('SIGKILL');
  }

  if (fs.existsSync(databasePath)) {
    fs.unlinkSync(databasePath);
  }
}

async function run() {
  const username = `smoke_${Date.now()}`;
  const password = 'smoke12345';

  await waitForServer();

  const register = await request('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  assert.equal(register.status, 201, 'register should create a user account');
  assert.equal(register.data.user.role, 'user', 'public registration should only create user accounts');

  const registerAdminAttempt = await request('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username: `${username}_admin`, password, role: 'admin' })
  });
  assert.equal(registerAdminAttempt.status, 403, 'public registration must reject privileged roles');

  const loginUser = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  assert.equal(loginUser.status, 200, 'user login should succeed');
  assert.ok(loginUser.data.accessToken, 'login should return an access token');
  assert.ok(loginUser.data.refreshToken, 'login should return a refresh token');

  const me = await request('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${loginUser.data.accessToken}`
    }
  });
  assert.equal(me.status, 200, '/auth/me should validate access tokens');
  assert.equal(me.data.user.username, username, '/auth/me should return the logged-in user');

  const createByUser = await request('/api/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loginUser.data.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'User forbidden product',
      category: 'GPU',
      price: 1000,
      stock: 1,
      description: 'User should not be allowed to create products.'
    })
  });
  assert.equal(createByUser.status, 403, 'user role must not create products');

  const usersByUser = await request('/api/users', {
    headers: {
      Authorization: `Bearer ${loginUser.data.accessToken}`
    }
  });
  assert.equal(usersByUser.status, 403, 'user role must not access admin users endpoint');

  const loginModerator = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username: 'moderator', password: 'mod12345' })
  });
  assert.equal(loginModerator.status, 200, 'moderator login should succeed');

  const createByModerator = await request('/api/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loginModerator.data.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Moderator product',
      category: 'GPU',
      price: 1500,
      stock: 2,
      description: 'Moderator can create products but must not delete them.'
    })
  });
  assert.equal(createByModerator.status, 201, 'moderator should create products');

  const moderatorDelete = await request(`/api/products/${createByModerator.data.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${loginModerator.data.accessToken}`
    }
  });
  assert.equal(moderatorDelete.status, 403, 'moderator must not delete products');

  const loginAdmin = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  assert.equal(loginAdmin.status, 200, 'admin login should succeed');
  adminAccessToken = loginAdmin.data.accessToken;

  const createByAdmin = await request('/api/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${loginAdmin.data.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: 'Admin product',
      category: 'GPU',
      price: 2000,
      stock: 3,
      description: 'Admin can create and remove products after smoke checks.'
    })
  });
  assert.equal(createByAdmin.status, 201, 'admin should create products');
  createdAdminProductId = createByAdmin.data.id;

  const refresh = await request('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'x-refresh-token': loginAdmin.data.refreshToken
    }
  });
  assert.equal(refresh.status, 200, 'refresh route should issue a new token pair');
  assert.notEqual(refresh.data.refreshToken, loginAdmin.data.refreshToken, 'refresh rotation should change the refresh token');

  const refreshReuse = await request('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'x-refresh-token': loginAdmin.data.refreshToken
    }
  });
  assert.equal(refreshReuse.status, 401, 'used refresh token should become invalid after rotation');

  const blacklistStats = await request('/api/auth/blacklist', {
    headers: {
      Authorization: `Bearer ${refresh.data.accessToken}`
    }
  });
  assert.equal(blacklistStats.status, 200, 'admin should access blacklist stats');
  assert.ok(
    Number(blacklistStats.data.refreshRevoked) >= 1,
    'blacklist stats should show at least one revoked refresh token after rotation'
  );

  const usersByAdmin = await request('/api/users', {
    headers: {
      Authorization: `Bearer ${refresh.data.accessToken}`
    }
  });
  assert.equal(usersByAdmin.status, 200, 'admin should access users endpoint');
  assert.ok(Array.isArray(usersByAdmin.data), 'users endpoint should return a list');
  assert.ok(
    usersByAdmin.data.some((user) => user.username === username && user.role === 'user'),
    'users endpoint should include the registered smoke-test account'
  );

  const logout = await request('/api/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${refresh.data.accessToken}`,
      'x-refresh-token': refresh.data.refreshToken
    }
  });
  assert.equal(logout.status, 200, 'logout should succeed');

  const meAfterLogout = await request('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${refresh.data.accessToken}`
    }
  });
  assert.equal(meAfterLogout.status, 401, 'logged-out access token should be blacklisted');

  const deleteModeratorProduct = await request(`/api/products/${createByModerator.data.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${loginAdmin.data.accessToken}`
    }
  });
  assert.equal(deleteModeratorProduct.status, 200, 'admin should be able to delete moderator-created products');

  console.log('Smoke test passed');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Checked practices: 7, 8, 9, 10, 11, 12`);
}

run()
  .catch((error) => {
    console.error('Smoke test failed');
    console.error(error);
    if (stdout.trim()) {
      console.error('Backend stdout:');
      console.error(stdout.trim());
    }
    if (stderr.trim()) {
      console.error('Backend stderr:');
      console.error(stderr.trim());
    }
    process.exitCode = 1;
  })
  .finally(cleanup);
