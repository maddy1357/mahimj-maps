'use strict';

/**
 * Small in-memory LRU cache with per-entry expiry.
 * `wrap()` also de-duplicates concurrent requests for the same key.
 */
class TTLCache {
  constructor({ max = 500, ttl = 10 * 60 * 1000 } = {}) {
    this.max = max;
    this.ttl = ttl;
    this.map = new Map();
    this.pending = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttl = this.ttl) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttl });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return value;
  }

  async wrap(key, producer, ttl) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = (async () => {
      try {
        return this.set(key, await producer(), ttl);
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, promise);
    return promise;
  }

  get size() {
    return this.map.size;
  }
}

module.exports = TTLCache;
