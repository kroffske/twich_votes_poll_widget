# OBS setup

## Browser Source

1. Запусти backend:

```bash
npm run start
```

2. В OBS добавь источник:

```text
Sources → + → Browser
```

3. Настройки источника:

```text
URL: http://localhost:3030/overlay?token=YOUR_TOKEN&mode=scale&metric=votes
Width: 1920
Height: 1080
FPS: 30
Shutdown source when not visible: yes
Refresh browser when scene becomes active: yes
```

4. Для нижней плашки можно обрезать Browser Source через Alt-drag в OBS или масштабировать источник.

Когда активного poll нет или он уже закончился, overlay остаётся полностью прозрачным и ничего не рисует. Для OBS это безопасно: Browser Source просто не покажет картинку, пока не придёт новый live/demo/query poll.

## Полезные URL

Весы по голосам:

```text
http://localhost:3030/overlay?token=YOUR_TOKEN&mode=scale&metric=votes
```

Весы по потраченным Channel Points:

```text
http://localhost:3030/overlay?token=YOUR_TOKEN&mode=scale&metric=points
```

Полоски:

```text
http://localhost:3030/overlay?token=YOUR_TOKEN&mode=bars&metric=votes
```

Меньше анимации:

```text
http://localhost:3030/overlay?token=YOUR_TOKEN&mode=scale&animation=reduced
```

## Admin page

```text
http://localhost:3030/admin?token=YOUR_TOKEN
```

В admin page можно запустить demo, восстановить последний Poll через Helix и скопировать OBS URL.

Текущий runtime использует один tavern-style theme; `theme` в URL сейчас не обязателен и не меняет рендер.
