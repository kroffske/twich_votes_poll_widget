#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

function bin(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

fs.mkdirSync(dist, { recursive: true });
for (const file of fs.readdirSync(dist)) {
  if (file.endsWith('.tgz')) fs.rmSync(path.join(dist, file), { force: true });
}

const result = spawnSync(bin('npm'), ['pack', '--pack-destination', dist, '--silent'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit']
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const tarballName = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
if (!tarballName) {
  console.error('npm pack did not return a tarball name');
  process.exit(1);
}

const tarballPath = path.join(dist, tarballName);
console.log(tarballPath);
