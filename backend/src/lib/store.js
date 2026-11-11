'use strict';
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Tiny JSON-file collection store. Good enough for a single-instance app:
 * data is kept in memory and written atomically (temp file + rename) on change.
 */
class JsonStore {
  constructor(file) {
    this.file = file;
    this.items = null;
    this.writeChain = Promise.resolve();
  }

  async load() {
    if (this.items) return this.items;
    try {
      const parsed = JSON.parse(await fsp.readFile(this.file, 'utf8'));
      this.items = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`[store] Could not read ${this.file}: ${err.message}. Starting empty.`);
      this.items = [];
    }
    return this.items;
  }

  async all() {
    return [...(await this.load())];
  }

  async count() {
    return (await this.load()).length;
  }

  async get(id) {
    return (await this.load()).find((item) => item.id === id) || null;
  }

  async insert(data) {
    await this.load();
    const now = new Date().toISOString();
    const item = { id: crypto.randomUUID(), ...data, createdAt: now, updatedAt: now };
    this.items.unshift(item);
    await this.persist();
    return item;
  }

  async update(id, patch) {
    await this.load();
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return null;
    this.items[index] = { ...this.items[index], ...patch, id, updatedAt: new Date().toISOString() };
    await this.persist();
    return this.items[index];
  }

  async remove(id) {
    await this.load();
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    if (this.items.length === before) return false;
    await this.persist();
    return true;
  }

  async clear() {
    await this.load();
    this.items = [];
    await this.persist();
  }

  persist() {
    const data = JSON.stringify(this.items, null, 2);
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        await fsp.mkdir(path.dirname(this.file), { recursive: true });
        const tmp = `${this.file}.${process.pid}.tmp`;
        await fsp.writeFile(tmp, data);
        await fsp.rename(tmp, this.file);
      });
    return this.writeChain;
  }
}

module.exports = JsonStore;
