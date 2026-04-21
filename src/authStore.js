import fs from 'node:fs/promises';
import path from 'node:path';

export class AuthStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.value = null;
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.value = JSON.parse(raw);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.value = null;
    }
    return this.value;
  }

  get() {
    return this.value;
  }

  async save(value) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
    this.value = value;
    return this.value;
  }

  async clear() {
    this.value = null;
    try {
      await fs.unlink(this.filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
