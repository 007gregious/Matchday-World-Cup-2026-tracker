'use strict';

/**
 * Minimal in-memory TTL cache.
 *
 * Render's free instances have their own memory and an ephemeral
 * filesystem, so a plain Map is perfect here — no Redis, no extra moving
 * parts, and it just disappears whenever the service restarts or spins
 * down after being idle.
 *
 * The whole point of this cache: no matter how many tabs/devices poll our
 * /api/* endpoints, we only call football-data.org / API-FOOTBALL when the
 * cached value has actually expired. That keeps us miles inside
 * football-data.org's 10 requests/minute and API-FOOTBALL's 100
 * requests/day free limits.
 */
class TTLCache {
  constructor() {
    this.store = new Map();
  }

  /** Returns the cached value, or undefined if missing/expired. */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Stores a value with a time-to-live in milliseconds. */
  set(key, value, ttlMs) {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      updatedAt: Date.now(),
    });
    return value;
  }

  /** ISO timestamp of when this key was last written, or null. */
  updatedAt(key) {
    const entry = this.store.get(key);
    return entry ? new Date(entry.updatedAt).toISOString() : null;
  }
}

module.exports = new TTLCache();
