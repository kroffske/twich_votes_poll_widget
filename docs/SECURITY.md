# Security notes

## Local streaming

Для локального OBS проекта достаточно `localhost` и `OVERLAY_TOKEN`.

`OVERLAY_TOKEN` — это локальный app token для admin/overlay URL. Он не заменяет `TWITCH_CLIENT_SECRET` и не связан с Twitch OAuth.

## Что нельзя показывать на стриме

- `.env`
- `data/auth.json`
- Twitch Client Secret
- `OVERLAY_TOKEN`
- admin page без токена

## Production рекомендации

1. Используй длинный `OVERLAY_TOKEN`.
2. Размести backend за reverse proxy.
3. Включи HTTPS, если overlay открывается не локально.
4. Закрой admin endpoints firewall-ом или basic auth.
5. Шифруй `data/auth.json` или используй secret storage.
6. Не коммить `.env`.
