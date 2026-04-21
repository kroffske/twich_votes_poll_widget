# Twitch Client ID / Client Secret

Эта инструкция нужна, если ты хочешь подключить **собственный** Twitch Developer Application и не использовать чужие ключи.

## Что есть что

В проекте есть два разных типа секретов:

- `TWITCH_CLIENT_ID` и `TWITCH_CLIENT_SECRET` — выдаются Twitch Developer Console для твоего приложения.
- `OVERLAY_TOKEN` — локальный токен этого Node.js приложения. Он защищает `/admin`, `/overlay` и `/ws/overlay`.

Важно:

- `OVERLAY_TOKEN` не связан с Twitch OAuth.
- `TWITCH_CLIENT_SECRET` нельзя показывать на стриме, коммитить в git или шарить в чатах.
- `.env.example` хранит только примеры. Реальные значения нужно писать только в локальный `.env`.

## 1. Создай Twitch application

1. Открой Twitch Developer Console.
2. Создай новое приложение.
3. В `OAuth Redirect URLs` добавь:

```text
http://localhost:3030/auth/callback
```

Если backend будет запущен на другом порту, redirect URL должен совпадать с ним один в один.

## 2. Получи ключи

После создания приложения Twitch покажет:

- `Client ID`
- `Client Secret`

Скопируй их в локальный `.env`.

## 3. Заполни локальный `.env`

Пример:

```env
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
TWITCH_REDIRECT_URI=http://localhost:3030/auth/callback
TWITCH_SCOPES=channel:read:polls channel:read:redemptions channel:manage:polls

# Local app token for OBS/admin. Not a Twitch secret.
OVERLAY_TOKEN=your-long-random-admin-token
```

Рекомендации:

- `TWITCH_CLIENT_SECRET` бери только из Twitch Developer Console.
- `OVERLAY_TOKEN` сгенерируй случайным длинным значением.
- Не копируй реальный `.env` в git. В репозитории остаётся только `.env.example`.

## 4. Перезапусти backend

После изменения `.env` перезапусти процесс:

```bash
npm start
```

Потом открой:

```text
http://localhost:3030/auth/login
```

и заверши OAuth flow заново.

## 5. Если менялись scopes

Если ты добавил новый scope, одного restart недостаточно. Нужно:

1. сделать logout в admin или через `POST /auth/logout`
2. снова открыть `/auth/login`
3. заново выдать consent в Twitch

## Безопасность

Никогда не коммить:

- `.env`
- `data/auth.json`
- `TWITCH_CLIENT_SECRET`
- реальный `OVERLAY_TOKEN`
