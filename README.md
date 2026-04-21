# Twitch Poll Scale Overlay для OBS

Проект выводит результаты **Twitch Poll** и/или **Channel Points battle** прямо в OBS через **Browser Source**.

Схема:

```text
Twitch EventSub WebSocket -> локальный Node.js backend -> локальный WebSocket -> OBS Browser Source
```

Визуальные режимы:

- `scale` — анимированные “весы” для стрима;
- `bars` — классические горизонтальные полоски голосования;
- `metric=votes` — обычные голоса;
- `metric=points` — потраченные Channel Points;
- `metric=cpVotes` — количество дополнительных Channel Points votes.

Стек теперь один: **Node.js + npm/npx**. `uvx`, Python-обертка и отдельный Python package удалены.

---

## Техническая документация

Для разработки и сопровождения удобный порядок чтения такой:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — границы модулей и правила размещения.
- [`docs/API.md`](docs/API.md) — локальные HTTP/WS endpoints и snapshot payload.
- [`docs/OBS_SETUP.md`](docs/OBS_SETUP.md) — настройка Browser Source и практические OBS URL.
- [`docs/TWITCH_SETUP.md`](docs/TWITCH_SETUP.md) — OAuth, scopes и live Poll flow.
- [`docs/TWITCH_APP_KEYS.md`](docs/TWITCH_APP_KEYS.md) — как завести свой Twitch app и подключить `Client ID` / `Client Secret`.
- [`docs/SECURITY.md`](docs/SECURITY.md) — базовые security notes.
- [`docs/DESIGN_ASSET_MAPPING.md`](docs/DESIGN_ASSET_MAPPING.md), [`docs/DESIGN_SCALES.md`](docs/DESIGN_SCALES.md) — заметки по tavern-assets и scale-анимации.

---

## Самый простой запуск

### Windows PowerShell

```powershell
cd .\<project-dir>
npm run demo
```

### macOS / Linux

```bash
cd ./<project-dir>
npm run demo
```

Команда `npm run demo` делает сразу несколько вещей:

1. создает `.env`, если его еще нет;
2. генерирует случайный `OVERLAY_TOKEN` вместо example placeholder из `.env.example`;
3. выполняет `npm install --omit=dev`, если зависимости еще не установлены;
4. запускает backend;
5. включает demo mode;
6. открывает admin page в браузере.

В консоли появятся готовые URL:

```text
Admin:              http://localhost:3030/admin?token=...
Twitch OAuth login: http://localhost:3030/auth/login
OBS scale / votes:  http://localhost:3030/overlay?token=...&mode=scale&metric=votes
OBS scale / points: http://localhost:3030/overlay?token=...&mode=scale&metric=points
OBS bars / votes:   http://localhost:3030/overlay?token=...&mode=bars&metric=votes
```

Для OBS обычно нужен URL `OBS scale / votes`.

Остановить сервер:

```text
Ctrl+C
```

---

## Ответ на вопрос про Windows и `npm install`

Да, проект рассчитан на Windows 10/11. В зависимостях только обычные JS-пакеты:

```text
dotenv
express
ws
```

Тут нет native-модулей, которые обычно требуют Visual Studio Build Tools, Python или компилятор C++. Поэтому на Windows достаточно установить **Node.js 20+**, вместе с ним ставится npm.

Проверка:

```powershell
node -v
npm -v
```

Если обе команды работают, проект должен запускаться через `npm run demo`.

---

## Требования

Минимально:

- Node.js `20+`;
- npm;
- OBS Studio;
- браузер;
- Twitch аккаунт стримера для реального режима.

Для настройки внешнего вида Twitch не нужен — достаточно `npm run demo`.

Для реального Poll режима нужны:

- Twitch Developer Application;
- `TWITCH_CLIENT_ID`;
- `TWITCH_CLIENT_SECRET`;
- Redirect URL: `http://localhost:3030/auth/callback`.

---

## Установка Node.js/npm

### Windows

1. Установи Node.js LTS.
2. При установке оставь включенным добавление Node.js в `PATH`.
3. Закрой и заново открой PowerShell.
4. Проверь:

```powershell
node -v
npm -v
```

### macOS / Linux

Подойдет любой способ установки Node.js 20+.

Проверка:

```bash
node -v
npm -v
```

---

## Основные команды npm

### Первый запуск demo mode

```bash
npm run demo
```

Это рекомендуемая команда для первой проверки.

### Запуск реального режима

```bash
npm start
```

`npm start` тоже создает `.env` и ставит зависимости при необходимости, но не принудительно открывает браузер.

### Создать `.env` без запуска сервера

```bash
npm run init
```

### Показать URL для OBS/admin

```bash
npm run urls
```

### Диагностика

```bash
npm run doctor
```

### Только поставить зависимости

```bash
npm run install:app
```

### Прямой запуск backend без CLI-обертки

```bash
npm run serve
```

Этот режим ожидает, что зависимости уже стоят, а `.env` уже создан.

---

## Запуск через npx без публикации в npm registry

Пакет пока не опубликован в npm registry, поэтому команда такого вида пока **не сработает**:

```bash
npx twitch-poll-scale-overlay
```

Пока используем локальный package tarball, который собирается из текущего кода.

### Вариант 1: одной командой собрать и запустить demo через npx

```bash
npm run npx:demo
```

Что делает команда:

1. собирает локальный npm package в `dist/twitch-poll-scale-overlay-0.3.0.tgz`;
2. запускает его через `npx --yes`;
3. передает в CLI аргументы `run --demo --open`.

### Вариант 2: собрать package отдельно

```bash
npm run pack:local
```

После этого появится файл:

```text
dist/twitch-poll-scale-overlay-0.3.0.tgz
```

Запуск через npx на Windows PowerShell:

```powershell
npx --yes .\dist\twitch-poll-scale-overlay-0.3.0.tgz run --demo --open
```

Запуск через npx на macOS/Linux:

```bash
npx --yes ./dist/twitch-poll-scale-overlay-0.3.0.tgz run --demo --open
```

Для реального Twitch режима:

```bash
npx --yes ./dist/twitch-poll-scale-overlay-0.3.0.tgz run --open
```

Важно: при запуске через локальный `.tgz` CLI хранит `.env` и `data/auth.json` в текущей папке, из которой ты запустил `npx`. Поэтому лучше запускать `npx` из корня проекта.

---

## Как устроен CLI

В `package.json` есть binary:

```json
"bin": {
  "twitch-poll-scale-overlay": "./bin/cli.js"
}
```

Локально его можно запускать так:

```bash
node bin/cli.js run --demo --open
node bin/cli.js doctor
node bin/cli.js urls
```

Для запуска CLI из исходников используй `node bin/cli.js ...` или npm scripts. Для npx до публикации package используй `npm run npx:demo` или локальный `.tgz` из `dist/`.

CLI поддерживает опции:

```text
--demo                    включить demo mode
--open                    открыть admin page в браузере
--port <number>           порт сервера, например 3010
--token <string>          задать OVERLAY_TOKEN
--work-dir <path>         где хранить .env и data/auth.json
--force-env               пересоздать .env из .env.example
--force-npm-install       принудительно выполнить npm install --omit=dev
```

Примеры:

```bash
npm start -- --port 3010
npm run demo -- --port 3010
npm run demo -- --token my-secret-token
npm start -- --work-dir ./runtime
```

На Windows PowerShell:

```powershell
npm run demo -- --port 3010
npm start -- --work-dir .\runtime
```

---

## Файлы после первого запуска

В корне проекта появятся:

```text
.env                 настройки Twitch/backend/overlay
node_modules/        npm-зависимости
data/auth.json       Twitch OAuth token после login
dist/*.tgz           локальный npm package после npm run pack:local
```

Эти файлы не нужно коммитить. Они уже добавлены в `.gitignore`.

---

## Настройка OBS Browser Source

1. Запусти сервер:

```bash
npm run demo
```

2. Скопируй из консоли URL `OBS scale / votes`.
3. В OBS добавь источник:

```text
Sources -> + -> Browser
```

4. Вставь URL.
5. Рекомендуемые размеры:

```text
Width:  1280
Height: 720
```

6. Включи:

```text
Refresh browser when scene becomes active
Shutdown source when not visible
```

7. Для прозрачного overlay фон уже сделан прозрачным через CSS.

Когда активного poll нет или он завершён, `/overlay` теперь остаётся пустым и прозрачным, без idle-заглушки. В OBS это означает, что источник просто ничего не показывает до следующего poll.

Пример OBS URL:

```text
http://localhost:3030/overlay?token=YOUR_TOKEN&mode=scale&metric=votes
```

---

## Query params overlay

### Режим

```text
mode=scale
mode=bars
```

### Метрика

```text
metric=votes
metric=points
metric=cpVotes
```

### Полезные дополнительные параметры

```text
animation=full
animation=reduced
pairOrder=source
pairOrder=ranked
item=coin|pelmen|pancake
preview=1
```

Примеры:

```text
/overlay?token=...&mode=scale&metric=votes&animation=reduced
/overlay?token=...&mode=scale&metric=points&pairOrder=ranked
/overlay?preview=1&question=Кто%20победит%3F&leftLabel=Left&rightLabel=Right&leftVotes=38&rightVotes=62&item=coin
```

Сейчас overlay использует один tavern-style theme. Параметр `theme` в URL не меняет рендер и не нужен для рабочих ссылок OBS.

---

## Как работает отображение “весов”

Для двух вариантов overlay показывает настоящие двухчашечные весы:

```text
left value  <->  right value
```

Наклон считается от разницы значений:

```text
tilt = ((right - left) / (right + left)) * maxTilt
```

Что анимируется:

- балка весов наклоняется;
- более тяжелая чаша опускается;
- цифры плавно меняются через tween animation;
- победитель получает визуальный акцент;
- при обновлении значения чаша делает pulse.

Для 3–5 вариантов используется hybrid layout:

- на весах показываются топ‑2 варианта;
- ниже показывается ranked list всех вариантов;
- так сохраняется формат “весов”, но остальные варианты не пропадают.

---

## Настройка Twitch Developer Application

1. Открой Twitch Developer Console.
2. Создай application.
3. В OAuth Redirect URLs добавь:

```text
http://localhost:3030/auth/callback
```

Если запускаешь на другом порту, например `3010`, redirect должен быть:

```text
http://localhost:3010/auth/callback
```

4. Скопируй `Client ID` и `Client Secret`.
5. Открой `.env` и заполни:

```env
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_REDIRECT_URI=http://localhost:3030/auth/callback
```

6. Проверь scopes:

```env
TWITCH_SCOPES=channel:read:polls channel:read:redemptions channel:manage:polls
```

`channel:read:polls` нужен для нативных Twitch Poll EventSub событий.

`channel:read:redemptions` нужен только для custom Channel Points rewards.

`channel:manage:polls` нужен, чтобы создавать poll из admin UI.

Важно: native Twitch Poll creation через Helix доступен только для каналов со статусом Affiliate или Partner. Для обычного канала login + scope будут успешными, но `POST /polls` вернёт `403 broadcaster_ineligible`.

Если проект разрабатывается под чужой канал, можно отдельно задать `TWITCH_TARGET_CHANNEL_LOGIN` или сохранить его из admin UI. Это только локальная project label-подсказка. Реальный broadcaster для Helix/EventSub всё равно берётся из Twitch OAuth account, который залогинился в приложение.

---

## Подключение Twitch OAuth

1. Запусти сервер:

```bash
npm start
```

2. Открой URL из консоли:

```text
Twitch OAuth login: http://localhost:3030/auth/login
```

3. Авторизуйся под аккаунтом стримера.
4. После callback backend сохранит токен в:

```text
data/auth.json
```

5. Backend подключится к EventSub WebSocket и подпишется на Poll events.

После этого создай Poll на Twitch-канале. Overlay должен обновляться автоматически.

Если `Create Poll` в admin возвращает ошибку про Affiliate/Partner, это ограничение Twitch по статусу канала, а не проблема OAuth. В таком случае для локальной проверки используй Demo mode или авторизуй Affiliate/Partner-канал.

---

## Нативные Twitch Poll vs custom Channel Points battle

### Нативные Twitch Poll

Поддерживаются события:

```text
channel.poll.begin
channel.poll.progress
channel.poll.end
```

Overlay получает агрегированные данные по вариантам:

```text
votes
channel_points_votes
channel_points_per_vote / amount_per_vote
```

Точный список пользователей, которые проголосовали, Twitch Poll payload не дает. Поэтому текущий overlay показывает проценты от голосов, а не точный процент уникальных зрителей.

### Custom Channel Points battle

Можно включить режим redemptions:

```env
ENABLE_REDEMPTIONS=true
```

И задать mapping reward ID -> choice name:

```env
REWARD_CHOICE_MAP_JSON={"reward-id-1":"Team Red","reward-id-2":"Team Blue"}
```

Тогда redemption события будут создавать synthetic poll state для points battle.

---

## Admin page

Admin page доступна по URL:

```text
http://localhost:3030/admin?token=YOUR_TOKEN
```

Возможности:

- посмотреть текущий snapshot;
- стартовать demo poll;
- остановить demo/reset;
- recover latest poll через Helix;
- reconnect EventSub;
- быстро копировать OBS URL.

`token` берется из `.env`:

```env
OVERLAY_TOKEN=your-long-random-admin-token
```

Это локальный токен приложения для `/admin`, `/overlay` и `/ws/overlay`.
Это не Twitch OAuth token и не `TWITCH_CLIENT_SECRET`.

---

## Безопасность

`OVERLAY_TOKEN` защищает admin/overlay endpoints от случайного доступа.

Для локального OBS сценария достаточно длинного случайного токена, который CLI генерирует автоматически.

Если нужно завести собственный Twitch app и получить `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`, см. [docs/TWITCH_APP_KEYS.md](docs/TWITCH_APP_KEYS.md).

Не публикуй в общий доступ:

```text
.env
data/auth.json
OVERLAY_TOKEN
TWITCH_CLIENT_SECRET
```

Если запускаешь backend не локально, а на удаленном сервере, понадобится HTTPS/reverse proxy и более строгая защита токенов.

---

## Troubleshooting

### `node` или `npm` не найден

Проверь:

```bash
node -v
npm -v
```

Если команды не работают, установи Node.js 20+ и открой новый терминал.

### Порт 3030 занят

Запусти на другом порту:

```bash
npm run demo -- --port 3010
```

В Twitch Developer Application тогда тоже добавь redirect:

```text
http://localhost:3010/auth/callback
```

### OBS показывает пустой экран

Проверь:

1. Сервер запущен.
2. URL в OBS содержит правильный `token`.
3. Открой тот же URL в обычном браузере.
4. Для проверки используй demo mode:

```bash
npm run demo
```

### Twitch OAuth callback error

Проверь совпадение redirect URL в трех местах:

```text
Twitch Developer Console
.env -> TWITCH_REDIRECT_URI
адрес, на котором реально запущен backend
```

Для порта `3030` должно быть:

```text
http://localhost:3030/auth/callback
```

### Poll не обновляется

Проверь:

1. OAuth пройден под аккаунтом стримера.
2. В `.env` есть scope `channel:read:polls`.
3. После изменения scopes нужно удалить `data/auth.json` и пройти OAuth заново.
4. В admin page нажми reconnect EventSub.
5. Попробуй recover latest poll.

### `npx twitch-poll-scale-overlay` не работает

Пакет еще не опубликован в npm registry. Используй локальный tarball:

```bash
npm run npx:demo
```

или:

```bash
npm run pack:local
npx --yes ./dist/twitch-poll-scale-overlay-0.3.0.tgz run --demo --open
```

На Windows:

```powershell
npm run pack:local
npx --yes .\dist\twitch-poll-scale-overlay-0.3.0.tgz run --demo --open
```

---

## Структура проекта

```text
bin/                    Node CLI для npm/npx
src/                    backend
public/                 overlay/admin frontend
docs/                   документация и обновленный план
examples/               примеры EventSub payloads
scripts/                локальная сборка npm package / npx запуск
test/                   node:test проверки логики state
.env.example            шаблон настроек
package.json            npm package metadata, scripts, bin
```

---

## Проверка разработчиком

```bash
npm run lint:check
npm test
npm run pack:local
```

Smoke test запуска:

```bash
npm run demo -- --port 3010
```

Smoke test локального npx package:

```bash
npm run npx:demo -- --port 3011
```
