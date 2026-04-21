---
title: Twitch Poll Scale Overlay Architecture
updated_at: 2026-04-21
---

# Architecture

Этот файл держит короткую карту модулей. Для запуска смотри `README.md`, для runbook'ов — папку `docs/`.

## Boundary Index

| Surface | Owns | Does not own |
|---|---|---|
| `bin/` | CLI bootstrap, first-run UX, `.env` init, URL printing, process launch | HTTP routes, Twitch logic, DOM rendering |
| `src/` | config, auth persistence, Poll normalization, EventSub/Helix, HTTP API, local WS broadcast | visual layout/assets, admin markup |
| `public/` | overlay/admin render, query params, tavern assets, local control UI | OAuth persistence, Helix/EventSub lifecycle |
| `docs/` | setup guides, API notes, security notes, design references | runtime implementation |

## Placement Rules

| Change | Put it in | Avoid |
|---|---|---|
| Новый CLI флаг или first-run UX | `bin/cli.js` | логика route/render в CLI |
| Новый HTTP endpoint / admin action | `src/server.js` или отдельный `src/*Route*.js` | встраивать route logic в `public/admin.html` |
| Новая Twitch/EventSub интеграция | `src/twitchAuth.js`, `src/twitchApi.js`, `src/eventsubClient.js` | прямые `fetch` к Twitch из frontend |
| Изменение snapshot schema или poll math | `src/state.js` + тесты | дублировать вычисления в `overlay.js` |
| Новая overlay настройка, layout или анимация | `public/overlay.js`, `public/overlay.css`, `public/overlay-layout.js` | править только docs без runtime sync |
| Новый operator/how-to doc | `docs/*.md` | раздувать `README.md` или этот файл деталями |

## Decision Prompts

1. Изменение касается первого запуска, `--work-dir`, `.env` или auto-install? Начни с `bin/cli.js`.
2. Изменение меняет snapshot, poll totals или reward battle? Начни с `src/state.js`.
3. Изменение касается URL, DOM или визуального поведения overlay/admin? Работай в `public/`.
4. Изменение добавляет новый Twitch REST/WS вызов? Трогай `src/twitchAuth.js`, `src/twitchApi.js` и/или `src/eventsubClient.js`.
5. Изменение требует новый how-to или операторскую подсказку? Обнови `docs/` и, при необходимости, `README.md`.

## Notes

- `data/` — локальный runtime state. Папка не коммитится и создаётся приложением автоматически.
- `OVERLAY_TOKEN` — локальный app token для `/admin`, `/overlay` и `/ws/overlay`. Это не Twitch OAuth secret.
