#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const ENV_EXAMPLE = path.join(PACKAGE_ROOT, '.env.example');
const REQUIRED_DEPS = ['dotenv', 'express', 'ws'];
const EXAMPLE_OVERLAY_TOKENS = new Set([
  'change-me',
  'admin-overlay-token-example',
  'replace-with-long-random-admin-token'
]);

function platformBin(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function print(message = '') {
  process.stdout.write(`${message}\n`);
}

function error(message = '') {
  process.stderr.write(`${message}\n`);
}

function parseArgs(argv) {
  const result = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];

    if (item === '--') {
      result._.push(...argv.slice(i + 1));
      break;
    }

    if (item.startsWith('--')) {
      const raw = item.slice(2);
      const eq = raw.indexOf('=');
      if (eq >= 0) {
        const key = raw.slice(0, eq);
        const value = raw.slice(eq + 1);
        result[key] = value;
        continue;
      }

      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        result[raw] = next;
        i += 1;
      } else {
        result[raw] = true;
      }
      continue;
    }

    if (item === '-h') {
      result.help = true;
      continue;
    }

    result._.push(item);
  }

  return result;
}

function normalizeCommand(argv) {
  const args = [...argv];
  let command = 'help';
  if (args[0] && !args[0].startsWith('-')) {
    command = args.shift();
  }
  return { command, options: parseArgs(args) };
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function isExampleOverlayToken(value) {
  if (value === undefined || value === null) return true;
  return EXAMPLE_OVERLAY_TOKENS.has(String(value).trim());
}

function resolveWorkDir(options) {
  const value = options['work-dir'] || options.workdir || options.appDir || options['app-dir'] || process.cwd();
  return path.resolve(String(value));
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function readEnvFile(envFile) {
  try {
    return parseEnv(await fsp.readFile(envFile, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function replaceOrAppendEnv(text, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (re.test(text)) return text.replace(re, line);
  return `${text.replace(/\s*$/, '')}\n${line}\n`;
}

function applyEnvOverrides(text, options) {
  const port = options.port ? Number(options.port) : null;
  if (port && Number.isFinite(port)) {
    text = replaceOrAppendEnv(text, 'PORT', String(port));
    text = replaceOrAppendEnv(text, 'PUBLIC_BASE_URL', `http://localhost:${port}`);
    text = replaceOrAppendEnv(text, 'TWITCH_REDIRECT_URI', `http://localhost:${port}/auth/callback`);
  }

  if (options.token) {
    text = replaceOrAppendEnv(text, 'OVERLAY_TOKEN', String(options.token));
  }

  return text;
}

async function ensureEnv(options) {
  const workDir = resolveWorkDir(options);
  await fsp.mkdir(workDir, { recursive: true });
  const envFile = path.join(workDir, '.env');

  let created = false;
  let current = '';
  const force = Boolean(options.force || options['force-env']);

  if (fs.existsSync(envFile) && !force) {
    current = await fsp.readFile(envFile, 'utf8');
  } else {
    try {
      current = await fsp.readFile(ENV_EXAMPLE, 'utf8');
    } catch {
      current = [
        'TWITCH_CLIENT_ID=',
        'TWITCH_CLIENT_SECRET=',
        'TWITCH_REDIRECT_URI=http://localhost:3030/auth/callback',
        'TWITCH_SCOPES=channel:read:polls channel:read:redemptions channel:manage:polls',
        'PORT=3030',
        'PUBLIC_BASE_URL=http://localhost:3030',
        'OVERLAY_TOKEN=admin-overlay-token-example',
        'DEMO_ON_START=true',
        'ENABLE_REDEMPTIONS=false',
        'REWARD_CHOICE_MAP_JSON={}',
        'REWARDS_POLL_TITLE=Channel Points Battle',
        'DEFAULT_OVERLAY_MODE=scale',
        'DEFAULT_OVERLAY_METRIC=votes',
        ''
      ].join('\n');
    }
    current = replaceOrAppendEnv(current, 'OVERLAY_TOKEN', options.token || randomToken());
    created = true;
  }

  const parsedBefore = parseEnv(current);
  if (isExampleOverlayToken(parsedBefore.OVERLAY_TOKEN)) {
    current = replaceOrAppendEnv(current, 'OVERLAY_TOKEN', options.token || randomToken());
  }

  current = applyEnvOverrides(current, options);

  await fsp.writeFile(envFile, current, 'utf8');
  return { workDir, envFile, created };
}

function dependenciesInstalled() {
  return REQUIRED_DEPS.every((dep) => fs.existsSync(path.join(PACKAGE_ROOT, 'node_modules', dep, 'package.json')));
}

function runSync(command, args, opts = {}) {
  const result = spawnSync(platformBin(command), args, {
    cwd: opts.cwd || PACKAGE_ROOT,
    env: opts.env || process.env,
    stdio: opts.stdio || 'inherit',
    encoding: opts.encoding || undefined
  });

  if (result.error) throw result.error;
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
  }
  return result;
}

async function installDependencies(options = {}) {
  if (!options.force && dependenciesInstalled()) {
    print('npm-зависимости уже установлены.');
    return;
  }

  print('Устанавливаю npm-зависимости...');
  runSync('npm', ['install', '--omit=dev'], { cwd: PACKAGE_ROOT });
}

function buildUrls(env, options = {}) {
  const port = options.port || env.PORT || '3030';
  const base = env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  const token = options.token || env.OVERLAY_TOKEN || '';
  const encodedToken = encodeURIComponent(token);
  const tokenPart = token ? `token=${encodedToken}` : '';
  const join = tokenPart ? '&' : '';
  return {
    base,
    admin: `${base}/admin${token ? `?token=${encodedToken}` : ''}`,
    auth: `${base}/auth/login`,
    scaleVotes: `${base}/overlay?${tokenPart}${join}mode=scale&metric=votes`,
    scalePoints: `${base}/overlay?${tokenPart}${join}mode=scale&metric=points`,
    barsVotes: `${base}/overlay?${tokenPart}${join}mode=bars&metric=votes`
  };
}

function printUrls(urls) {
  print('');
  print('Готовые URL:');
  print(`  Admin:              ${urls.admin}`);
  print(`  Twitch OAuth login: ${urls.auth}`);
  print(`  OBS scale / votes:  ${urls.scaleVotes}`);
  print(`  OBS scale / points: ${urls.scalePoints}`);
  print(`  OBS bars / votes:   ${urls.barsVotes}`);
  print('');
}

function openUrl(url) {
  let command;
  let args;

  if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch {
    // Browser auto-open is a convenience only.
  }
}

async function commandInit(options) {
  const info = await ensureEnv(options);
  const env = await readEnvFile(info.envFile);
  const urls = buildUrls(env, options);

  print(info.created ? `Создан файл настроек: ${info.envFile}` : `Файл настроек уже есть: ${info.envFile}`);
  print(`Рабочая папка: ${info.workDir}`);
  printUrls(urls);
}

async function commandInstall(options) {
  await installDependencies({ force: Boolean(options.force || options['force-npm-install']) });
}

async function commandUrls(options) {
  const info = await ensureEnv(options);
  const env = await readEnvFile(info.envFile);
  print(`Файл настроек: ${info.envFile}`);
  printUrls(buildUrls(env, options));
}

async function commandDoctor(options) {
  const workDir = resolveWorkDir(options);
  const envFile = path.join(workDir, '.env');
  const nodeVersion = process.version;
  const npmResult = spawnSync(platformBin('npm'), ['-v'], { encoding: 'utf8' });
  const npmVersion = npmResult.status === 0 ? npmResult.stdout.trim() : 'not found';

  print('Диагностика Twitch Poll Scale Overlay');
  print(`  Node.js:      ${nodeVersion}`);
  print(`  npm:          ${npmVersion}`);
  print(`  Package root: ${PACKAGE_ROOT}`);
  print(`  Work dir:     ${workDir}`);
  print(`  .env:         ${fs.existsSync(envFile) ? envFile : 'не создан'}`);
  print(`  deps:         ${dependenciesInstalled() ? 'installed' : 'not installed'}`);
  print('');
  print('Команда для первого запуска: npm run demo');
}

async function commandRun(options) {
  const info = await ensureEnv(options);
  await installDependencies({ force: Boolean(options.force || options['force-npm-install']) });

  const envFileValues = await readEnvFile(info.envFile);
  const urls = buildUrls(envFileValues, options);
  print(`Рабочая папка: ${info.workDir}`);
  print(`Файл настроек: ${info.envFile}`);
  printUrls(urls);

  const childEnv = {
    ...process.env,
    OVERLAY_ENV_FILE: info.envFile,
    OVERLAY_DATA_DIR: path.join(info.workDir, 'data')
  };

  if (options.demo) childEnv.DEMO_ON_START = 'true';
  if (options.port) {
    childEnv.PORT = String(options.port);
    childEnv.PUBLIC_BASE_URL = `http://localhost:${options.port}`;
    childEnv.TWITCH_REDIRECT_URI = `http://localhost:${options.port}/auth/callback`;
  }
  if (options.token) childEnv.OVERLAY_TOKEN = String(options.token);

  if (options.open) {
    setTimeout(() => openUrl(urls.admin), 800);
  }

  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: PACKAGE_ROOT,
    env: childEnv,
    stdio: 'inherit'
  });

  const forward = (signal) => {
    if (!server.killed) server.kill(signal);
  };
  process.once('SIGINT', () => forward('SIGINT'));
  process.once('SIGTERM', () => forward('SIGTERM'));

  server.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

function printHelp() {
  print(`Twitch Poll Scale Overlay\n\nИспользование:\n  twitch-poll-scale-overlay <command> [options]\n  npm run demo\n  npm start\n\nКоманды:\n  run       Создать .env при необходимости, установить npm-зависимости и запустить backend\n  init      Создать .env и напечатать URL для OBS/admin\n  install   Установить npm-зависимости проекта\n  urls      Напечатать URL для OBS/admin\n  doctor    Проверить Node.js/npm/.env/dependencies\n  help      Показать эту справку\n\nОпции:\n  --demo                    Включить demo mode при запуске\n  --open                    Открыть admin page в браузере\n  --port <number>           Порт локального сервера, например 3010\n  --token <string>          Задать OVERLAY_TOKEN\n  --work-dir <path>         Где хранить .env и data/auth.json; по умолчанию текущая папка\n  --force-env               Пересоздать .env из .env.example\n  --force-npm-install       Принудительно выполнить npm install --omit=dev\n\nПримеры:\n  npm run demo\n  npm start\n  npx --yes ./dist/twitch-poll-scale-overlay-0.3.0.tgz run --demo --open\n`);
}

async function main() {
  const { command, options } = normalizeCommand(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  switch (command) {
    case 'run':
    case 'start':
      await commandRun(options);
      break;
    case 'init':
      await commandInit(options);
      break;
    case 'install':
      await commandInstall(options);
      break;
    case 'urls':
      await commandUrls(options);
      break;
    case 'doctor':
      await commandDoctor(options);
      break;
    case 'help':
      printHelp();
      break;
    default:
      error(`Неизвестная команда: ${command}`);
      printHelp();
      process.exitCode = 2;
  }
}

main().catch((err) => {
  error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
