import fs from 'node:fs/promises';
import path from 'node:path';

export class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.value = {};
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.value = {};
    }
    return this.value;
  }

  get() {
    return this.value || {};
  }

  async save(patch) {
    const next = {
      ...(this.value || {}),
      ...(patch || {})
    };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
    this.value = next;
    return this.value;
  }
}
