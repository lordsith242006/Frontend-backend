import axios from 'axios';

const ACCESS_TOKEN_KEY = 'practice_7_12_access_token';
const REFRESH_TOKEN_KEY = 'practice_7_12_refresh_token';
export const API_BASE_URL = (process.env.REACT_APP_API_URL || 'http://localhost:3000/api').replace(/\/+$/, '');
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

export function resolveAssetUrl(assetPath) {
  if (!assetPath) {
    return '';
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  const normalizedAssetPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${API_ORIGIN}${normalizedAssetPath}`;
}

export function getStoredAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(tokens) {
  if (tokens.accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  }

  if (tokens.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function withRefreshTokenHeader(refreshToken, config = {}) {
  if (!refreshToken) {
    return config;
  }

  return {
    ...config,
    headers: {
      ...config.headers,
      'x-refresh-token': refreshToken
    }
  };
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

let refreshRequest = null;

api.interceptors.request.use((config) => {
  const accessToken = getStoredAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isUnauthorized = error.response?.status === 401;

    if (!isUnauthorized || originalRequest._retry || originalRequest.url === '/auth/refresh') {
      return Promise.reject(error);
    }

    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      clearTokens();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!refreshRequest) {
      refreshRequest = api
        .post('/auth/refresh', null, withRefreshTokenHeader(refreshToken))
        .then((response) => {
          saveTokens(response.data);
          return response.data;
        })
        .catch((refreshError) => {
          clearTokens();
          throw refreshError;
        })
        .finally(() => {
          refreshRequest = null;
        });
    }

    const nextTokens = await refreshRequest;
    originalRequest.headers.Authorization = `Bearer ${nextTokens.accessToken}`;

    return api(originalRequest);
  }
);

export const authApi = {
  register(payload) {
    return api.post('/auth/register', payload);
  },
  login(payload) {
    return api.post('/auth/login', payload);
  },
  me() {
    return api.get('/auth/me');
  },
  logout(refreshToken) {
    return api.post('/auth/logout', null, withRefreshTokenHeader(refreshToken));
  },
  blacklistStats() {
    return api.get('/auth/blacklist');
  }
};

export const adminApi = {
  listUsers() {
    return api.get('/users');
  }
};

export const productsApi = {
  list(params) {
    return api.get('/products', { params });
  },
  getById(id) {
    return api.get(`/products/${id}`);
  },
  create(payload) {
    return api.post('/products', payload);
  },
  update(id, payload) {
    return api.put(`/products/${id}`, payload);
  },
  remove(id) {
    return api.delete(`/products/${id}`);
  }
};

export const uploadApi = {
  async image(file) {
    const formData = new FormData();
    formData.append('image', file);

    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data.imageUrl;
  }
};
