# Scripts

`pack-local.js` собирает локальный npm package в `dist/*.tgz` через `npm pack`.

`run-npx-local.js` сначала собирает локальный package, затем запускает его через `npx --yes`.

Команды:

```bash
npm run pack:local
npm run npx:demo
npm run npx:run -- --open
```

Эти команды нужны до публикации package в npm registry.
