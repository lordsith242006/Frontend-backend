# Практика Frontend

Учебный fullstack-проект по дисциплине «Frontend и backend разработка». В проекте реализованы авторизация пользователей, роли доступа и каталог товаров с возможностью добавления, редактирования и просмотра данных.

## Что реализовано

- регистрация и вход пользователей
- хеширование паролей через `bcrypt`
- `JWT` access-токены и refresh-токены
- автоматическое обновление токенов на frontend
- роли `admin`, `moderator`, `user`
- blacklist токенов при выходе
- CRUD товаров
- загрузка изображений
- SQLite для хранения данных

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

Для проверки API:

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

По умолчанию frontend запускается на `http://localhost:3001`, backend работает на `http://localhost:3000`.

Если нужно изменить адрес API, используйте переменную `REACT_APP_API_URL`.

## Демо-аккаунты

- `admin / admin123`
- `moderator / mod12345`
- `user / user12345`

## Интерфейс

- страница авторизации
- каталог товаров с фильтрами
- карточки товаров с подробной информацией
- формы создания и редактирования товаров
- отдельные административные разделы для пользователей и статистики токенов
