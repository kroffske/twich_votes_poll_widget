# Локальные endpoints

## Public pages

```text
GET /                 стартовая страница
GET /admin            admin page
GET /overlay          OBS overlay
GET /auth/login       Twitch OAuth redirect
GET /auth/callback    Twitch OAuth callback
```

## API

### `GET /api/status`

Возвращает состояние backend и overlay snapshot.

### `GET /api/snapshot`

Возвращает только текущий snapshot.

### `POST /api/demo/start`

Запускает demo poll.

Body:

```json
{
  "title": "Demo vote",
  "choices": ["Team Left", "Team Right"]
}
```

### `POST /api/demo/stop`

Останавливает demo interval.

### `POST /api/reset`

Очищает текущий PollState.

### `POST /api/settings/target-channel`

Сохраняет локальный `project target channel` для admin UI.

Body:

```json
{
  "login": "partner_channel_login"
}
```

Поле переживает рестарт процесса, сохраняется локально и попадает в `snapshot.targetChannel`.
Это только локальная метка проекта: она не меняет broadcaster, авторизованный через OAuth, и не переопределяет `broadcaster_id` для Helix/EventSub.

### `POST /api/twitch/recover-latest-poll`

Загружает последний Poll через Helix Get Polls.

### `POST /api/twitch/create-poll`

Создаёт live Poll на канале авторизованного пользователя через Helix `POST /polls`.
Требует scope `channel:manage:polls` (см. `docs/TWITCH_SETUP.md`).

Body:

```json
{
  "title": "Куда идём дальше?",
  "choices": ["Dust II", "Mirage", "Inferno"],
  "duration": 60
}
```

Валидация:

- `title` — string, 1..60 символов после trim.
- `choices` — массив 2..5 строк, каждая ≤ 25 символов после trim, без дубликатов
  (сравнение case-insensitive).
- `duration` — integer, 15..1800 секунд.

Успех (`201 Created`):

```json
{
  "ok": true,
  "poll": { /* нормализованный snapshot.poll */ },
  "snapshot": { /* свежий snapshot после setPollFromHelix */ }
}
```

Ошибки возвращаются в форме `{ "error": { "code", "message", "hint" } }`:

| HTTP | code                   | hint                                                | Когда                                                      |
|------|------------------------|-----------------------------------------------------|------------------------------------------------------------|
| 400  | `validation`           | `"title"` / `"choices"` / `"choices[i]"` / `"duration"` | Поле не прошло валидацию. `i` — 0-based индекс choice.     |
| 401  | `insufficient_scope`   | `"Re-login to grant channel:manage:polls scope."`   | У текущего токена нет scope `channel:manage:polls`.        |
| 403  | `broadcaster_ineligible` | `"Helix POST /polls is only available for Affiliate or Partner channels."` | Twitch не даёт создавать native Poll на канале без статуса Affiliate/Partner. |
| 409  | `active_poll_exists`   | `"Recover or end the current poll first."`          | На канале уже есть `ACTIVE` Poll.                          |
| 502  | `upstream`             | не задан                                             | Helix вернул 500 или неожиданная ошибка.                    |

### `POST /api/twitch/reconnect`

Перезапускает EventSub WebSocket connection.

### `POST /auth/logout`

Удаляет локальный token и отключает Twitch EventSub.

## Overlay WebSocket

```text
ws://localhost:3030/ws/overlay?token=YOUR_TOKEN
```

Сообщение:

```json
{
  "type": "snapshot",
  "payload": {
    "version": 1,
    "poll": {},
    "connection": {},
    "auth": {}
  }
}
```
