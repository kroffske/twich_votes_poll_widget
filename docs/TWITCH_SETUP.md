# Twitch setup

Если сначала нужно создать собственный Twitch Developer Application и получить `Client ID` / `Client Secret`, см. [`docs/TWITCH_APP_KEYS.md`](./TWITCH_APP_KEYS.md).

## 1. Создай Twitch application

В Twitch Developer Console создай приложение и добавь OAuth Redirect URL:

```text
http://localhost:3030/auth/callback
```

## 2. Заполни `.env`

```env
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_REDIRECT_URI=http://localhost:3030/auth/callback
TWITCH_SCOPES=channel:read:polls channel:read:redemptions channel:manage:polls
OVERLAY_TOKEN=your-long-random-admin-token
```

`OVERLAY_TOKEN` — это локальный токен для `/admin`, `/overlay` и `/ws/overlay`. Это не Twitch token и не `TWITCH_CLIENT_SECRET`.

`channel:read:polls` нужен для нативных Poll events.

`channel:read:redemptions` нужен только для custom Channel Points reward redemptions.

`channel:manage:polls` нужен, чтобы создавать poll из admin UI (Helix `POST /polls`). Без него `POST /api/twitch/create-poll` вернёт `insufficient_scope` и admin подскажет перелогиниться.

Важно: одного scope недостаточно. Twitch разрешает native `POST /polls` только для каналов со статусом Affiliate или Partner. Если авторизованный канал обычный, backend вернёт `broadcaster_ineligible` (HTTP 403), а admin объяснит, что это платформенное ограничение Twitch, а не проблема `.env`.

## Scope changes require re-login

Twitch выдаёт scope'ы один раз на момент OAuth authorize. Если ты поменял `TWITCH_SCOPES` в `.env` (например, добавил `channel:manage:polls`), **существующий токен в `data/auth.json` новый scope не получит автоматически** — refresh возвращает тот же набор прав, который был выдан при исходном login.

Чтобы подтянуть новый scope:

1. Перезапусти процесс (чтобы `.env` подхватился).
2. Сделай logout — либо `POST /auth/logout` с текущим overlay token, либо `Logout` в admin (кнопка появится в Slice B).
3. Открой `/auth/login` и заверши OAuth flow заново. Twitch покажет новый consent screen со всеми scope'ами из `.env`.
4. После callback backend заново подпишется на EventSub и `snapshot.auth.scopes` будет включать новый scope.

При перелогине backend автоматически включает `force_verify=true`, чтобы Twitch показал consent screen заново и granted scopes обновились.

Если этот шаг пропущен, backend при попытке `create-poll` вернёт `insufficient_scope` (HTTP 401) и admin покажет баннер re-login.

## 3. Авторизация

```bash
npm run start
```

Открой:

```text
http://localhost:3030/auth/login
```

После OAuth callback backend сохранит user token в `data/auth.json`, подключится к EventSub WebSocket и создаст подписки.

## 4. Проверка

Открой:

```text
http://localhost:3030/admin?token=YOUR_TOKEN
```

Проверь `connection.twitch`:

- `connecting` — backend подключается к EventSub;
- `connected` — WebSocket открыт;
- `subscribed` — подписки созданы;
- `disconnected` — нет соединения или не выполнен OAuth login.

## 5. Восстановление активного Poll

Если Poll был запущен до старта backend, нажми в admin:

```text
Recover Latest Poll
```

Это вызовет Helix Get Polls и загрузит последний активный Poll.
