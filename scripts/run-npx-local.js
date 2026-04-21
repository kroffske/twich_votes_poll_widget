#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function bin(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

const pack = spawnSync(process.execPath, [path.join(root, 'scripts', 'pack-local.js')], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit']
});

if (pack.error) throw pack.error;
if (pack.status !== 0) process.exit(pack.status ?? 1);

const tarballPath = pack.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
if (!tarballPath) {
  console.error('Could not build local npm package');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const npx = spawnSync(bin('npx'), ['--yes', tarballPath, 'run', ...extraArgs], {
  cwd: root,
  stdio: 'inherit'
});

if (npx.error) throw npx.error;
process.exit(npx.status ?? 0);
