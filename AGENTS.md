# AGENTS.md

<project>
- Локальный Node.js overlay для Twitch Poll / Channel Points в OBS Browser Source.
- Базовые команды: `npm run demo`, `npm start`, `npm test`, `npm run lint:check`, `npm run pack:local`.
</project>

<scope>
- Эти правила действуют на весь репозиторий.
</scope>

<layers>
- `bin/` — CLI bootstrap и first-run UX.
- `src/` — backend runtime, Twitch auth/EventSub, snapshot state.
- `public/` — overlay/admin frontend и tavern assets.
- `docs/` — operator/reference docs.
</layers>

<tools>
- Для поиска предпочитай `rg`.
- Для проверки используй `npm test` и `npm run lint:check`; install scripts не запускай без необходимости.
</tools>

<golden_rules>
- Не коммить `.env`, `data/`, `dist/` и Twitch secrets.
- Держи `README.md` человеко-ориентированным, а `ARCHITECTURE.md` — коротким boundary/index surface.
- Обновляй docs, если меняются команды, пути, overlay query params или модульные границы.
</golden_rules>
