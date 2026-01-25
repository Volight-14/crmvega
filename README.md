# CRM Система с Telegram ботом

> **⚠️ ВАЖНО: ТЕКУЩАЯ АРХИТЕКТУРА ДЕПЛОЯ**
> - **Frontend**: Vercel (автоматический деплой из main)
> - **Backend**: Render https://crmvega-g766.onrender.com ⚡️ НЕ ЗАПУСКАТЬ ЛОКАЛЬНО
> - **Database**: Supabase
> - **Сборщик**: Vite (не Create React App!)

Полнофункциональная CRM система для управления заявками и общения с клиентами через Telegram бота.

## Возможности

- ✅ Управление заявками с различными статусами
- ✅ Общение с клиентами через Telegram бота 
- ✅ Real-time чат между менеджерами и клиентами
- ✅ Система аутентификации менеджеров
- ✅ Современный веб-интерфейс
- ✅ Автоматическое создание заявок из сообщений бота

## Архитектура

```
crm/
├── backend/          # Node.js API сервер
│   ├── routes/       # API маршруты
│   ├── middleware/   # Middleware функции
│   ├── migrations/   # SQL миграции
│   └── index.js      # Главный серверный файл
├── frontend/         # React веб-приложение
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── types/
│   │   └── contexts/
│   └── package.json
├── bot/              # Telegram бот
│   ├── index.js
│   └── package.json
└── README.md
```

## Технологии

- **Backend**: Node.js, Express, Socket.IO, Supabase
- **Frontend**: React, TypeScript, Ant Design, Socket.IO, **Vite** (сборщик)
- **Database**: PostgreSQL (через Supabase)
- **Bot**: Telegram Bot API, Telegraf
- **Real-time**: Socket.IO

## Настройка и запуск

### 1. Установка зависимостей

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# Bot
cd ../bot
npm install
```

### 2. Настройка Supabase

1. Создайте проект на [supabase.com](https://supabase.com)
2. Получите URL проекта и анонимный ключ
3. Создайте базу данных и выполните миграцию из `backend/migrations/001_initial_schema.sql`

### 3. Настройка Telegram бота

1. Создайте бота через [@BotFather](https://t.me/botfather)
2. Получите токен бота

### 4. Конфигурация переменных окружения

Создайте `.env` файлы в каждой папке:

**backend/.env:**
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret
PORT=5000
FRONTEND_URL=http://localhost:3000
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

**bot/.env:**
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
API_BASE_URL=http://localhost:5000/api
CRM_API_TOKEN=your_crm_api_token
```

**frontend/.env:**
```env
VITE_API_URL=https://crmvega-g766.onrender.com/api
VITE_SOCKET_URL=https://crmvega-g766.onrender.com
```

> **Примечание**: После миграции на Vite используется префикс `VITE_` вместо `REACT_APP_`

### 5. Запуск системы

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm start

# Terminal 3: Bot
cd bot
npm run dev
```

### 6. Доступ к системе

- **CRM интерфейс**: http://localhost:3000
- **API документация**: http://localhost:5000/api

## Использование

### Регистрация менеджера

1. Перейдите на http://localhost:3000/login
2. Выберите вкладку "Регистрация"
3. Заполните форму и нажмите "Зарегистрироваться"

### Работа с заявками

1. Войдите в систему
2. На главной странице вы увидите список всех заявок
3. Используйте фильтры для поиска по статусу
4. Нажмите "Открыть" для просмотра деталей заявки
5. В чате можно обмениваться сообщениями с клиентом

### Работа с ботом

1. Найдите бота в Telegram по username
2. Отправьте `/start`
3. Напишите сообщение - автоматически создастся заявка
4. Менеджеры увидят сообщение в CRM и смогут ответить

## API Endpoints

### Аутентификация
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Авторизация

### Заявки
- `GET /api/leads` - Получить все заявки
- `POST /api/leads` - Создать заявку
- `GET /api/leads/:id` - Получить заявку по ID
- `PATCH /api/leads/:id/status` - Изменить статус

### Сообщения
- `GET /api/messages/lead/:leadId` - Получить сообщения заявки
- `POST /api/messages` - Отправить сообщение

### Бот
- `POST /api/bot/send-message` - Отправить сообщение через бота

## Статусы заявок

- **new** - Новая заявка
- **contacted** - Контакт установлен
- **in_progress** - В работе
- **qualified** - Квалифицирована
- **lost** - Потеряна
- **won** - Выиграна

## Разработка

### Добавление новых функций

1. Создайте миграцию в `backend/migrations/`
2. Обновите типы в `frontend/src/types/`
3. Добавьте API endpoints в соответствующие routes
4. Создайте компоненты и страницы

### Структура базы данных

```sql
-- Основные таблицы
managers (менеджеры)
leads (заявки)
messages (сообщения)

-- Связи
leads.manager_id -> managers.id
messages.lead_id -> leads.id
messages.sender_id -> managers.id (для сообщений менеджеров)
```

## Безопасность

- JWT токены для аутентификации
- Row Level Security (RLS) в Supabase
- Валидация входных данных
- CORS настройки

## Развертывание

### Текущая архитектура (Production)

```
Frontend (React)  → Vercel
Backend (Node.js) → Render (для поддержки WebSocket/Socket.IO)
Database          → Supabase
```

### Frontend на Vercel

1. Создайте репозиторий на GitHub и запушьте код
2. Перейдите на [vercel.com](https://vercel.com) и импортируйте репозиторий
3. Выберите папку `frontend` как Root Directory
4. Настройте переменные окружения в Vercel dashboard:
   - `VITE_API_URL` - URL вашего backend на Render (например: `https://crmvega-g766.onrender.com/api`)
   - `VITE_SOCKET_URL` - URL для Socket.IO (например: `https://crmvega-g766.onrender.com`)
5. Deploy будет автоматическим при пуше в main ветку

### Backend на Render

1. Перейдите на [render.com](https://render.com)
2. Создайте новый **Web Service**
3. Подключите ваш GitHub репозиторий
4. Настройки:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
5. Добавьте Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `TELEGRAM_BOT_TOKEN` ← **Здесь меняем токен бота!**
   - `FRONTEND_URL` - URL вашего frontend на Vercel
   - `PORT=5001`
6. Deploy будет автоматическим

**Почему Render для backend?**
- ✅ Поддержка WebSocket (Socket.IO для real-time чата)
- ✅ Постоянное соединение (не serverless)
- ✅ Бесплатный план с достаточными ресурсами

### Production (традиционный сервер)

1. Настройте переменные окружения для продакшена
2. Соберите frontend: `npm run build`
3. Настройте reverse proxy (nginx)
4. Запустите сервисы с помощью PM2 или Docker

### Docker

Создайте `docker-compose.yml` для запуска всех сервисов.

## Поддержка

При возникновении проблем:

1. Проверьте логи каждого сервиса
2. Убедитесь, что все переменные окружения настроены
3. Проверьте подключение к Supabase
4. Убедитесь, что Telegram бот токен действительный
