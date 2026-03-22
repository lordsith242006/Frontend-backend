# Inventory Studio

Учебный fullstack-проект по дисциплине «Frontend и backend разработка». Приложение сочетает каталог комплектующих, JWT-авторизацию, разграничение ролей и административные панели для контроля пользователей и сессий.

## Что реализовано

- регистрация и вход пользователей
- хеширование паролей через `bcrypt`
- `JWT` access-токены и refresh-токены с ротацией
- автоматическое обновление access-токена на frontend
- `RBAC` с ролями `admin`, `moderator`, `user`
- blacklist токенов при выходе
- защищённый CRUD товаров
- загрузка изображений
- SQLite для пользователей, товаров и сессий

## Стек

- frontend: React
- backend: Express
- database: SQLite

## Запуск backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

База данных создаётся в `backend/practice-7-12.sqlite`.

Для быстрой проверки API:

```bash
cd backend
npm run smoke
```

## Запуск frontend

```bash
cd frontend
npm install
npm start
```

По умолчанию frontend запускается на `http://localhost:3001`, а backend ожидается на `http://localhost:3000`.

При необходимости адрес API можно переопределить через `REACT_APP_API_URL`.

## Демо-аккаунты

- `admin / admin123`
- `moderator / mod12345`
- `user / user12345`

## Особенности интерфейса

- светлая редакционная стилистика вместо стандартного тёмного dashboard-оформления
- отдельная hero-секция со сводкой каталога
- блок рекомендованных товаров на основе рейтинга
- модальные окна для просмотра и редактирования карточек
- административные панели раскрываются по кнопке и не перегружают основной экран
