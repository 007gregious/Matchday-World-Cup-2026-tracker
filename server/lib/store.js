'use strict';

const crypto = require('crypto');

/**
 * Persistent storage for push notification subscriptions.
 *
 * WHY THIS NEEDS TO BE PERSISTENT (not the in-memory cache.js): Render's
 * free web service sleeps after 15 minutes idle and loses all in-memory
 * state on every restart. A subscription stored only in memory would
 * silently vanish the first time the service spins down — the person
 * would think notifications were on, and just... stop getting them. A
 * free Upstash Redis database (REST API, no persistent TCP connection
 * needed — perfect for a server that sleeps) survives restarts, so a
 * subscription saved once keeps working indefinitely.
 *
 * This module is the ONLY place that talks to Upstash. If you ever want
 * to swap providers (a different free Redis host, a small Postgres
 * instance, etc.), this is the one file to change — nothing else in the
 * app knows or cares how subscriptions are stored.
 */

let client = null;
let triedInit = false;

function getClient() {
  if (triedInit) return client;
  triedInit = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  // Lazy-required so the app still boots fine if @upstash/redis isn't
  // installed in some stripped-down environment — this whole feature is
  // optional.
  const { Redis } = require('@upstash/redis');
  client = new Redis({ url, token });
  return client;
}

function isConfigured() {
  return !!getClient();
}

function configError() {
  const err = new Error(
    'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. Push notifications need a ' +
      'free Upstash Redis database (no card required) — see the README.'
  );
  err.code = 'MISSING_KEY';
  return err;
}

/** Stable short id derived from a push subscription's unique endpoint URL. */
function idFor(endpoint) {
  return crypto.createHash('sha1').update(endpoint).digest('hex');
}

/** Upstash's client may hand back an already-parsed object or a raw string depending on SDK version — handle both. */
function parseRecord(raw) {
  if (raw == null) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function saveSubscription(subscription, favorites) {
  const r = getClient();
  if (!r) throw configError();
  const id = idFor(subscription.endpoint);
  const record = { subscription, favorites: favorites || [], updatedAt: Date.now() };
  await r.set(`push:sub:${id}`, JSON.stringify(record));
  await r.sadd('push:subs', id);
  return id;
}

async function updateFavorites(endpoint, favorites) {
  const r = getClient();
  if (!r) throw configError();
  const id = idFor(endpoint);
  const existing = parseRecord(await r.get(`push:sub:${id}`));
  if (!existing) return false;
  existing.favorites = favorites || [];
  existing.updatedAt = Date.now();
  await r.set(`push:sub:${id}`, JSON.stringify(existing));
  return true;
}

async function deleteSubscriptionByEndpoint(endpoint) {
  const r = getClient();
  if (!r) return;
  const id = idFor(endpoint);
  await Promise.all([r.del(`push:sub:${id}`), r.srem('push:subs', id)]);
}

async function deleteSubscriptionById(id) {
  const r = getClient();
  if (!r) return;
  await Promise.all([r.del(`push:sub:${id}`), r.srem('push:subs', id)]);
}

/** All current subscriptions, as `{ id, subscription, favorites, updatedAt }`. */
async function listSubscriptions() {
  const r = getClient();
  if (!r) return [];
  const ids = await r.smembers('push:subs');
  if (!ids || !ids.length) return [];
  const records = await Promise.all(
    ids.map(async (id) => {
      const record = parseRecord(await r.get(`push:sub:${id}`));
      return record ? { id, ...record } : null;
    })
  );
  return records.filter(Boolean);
}

// ---- Dedupe markers used by the notification watcher -----------------
// (so a kickoff/full-time alert fires once, not on every 60s tick, and
// survives a restart in between)

/** True if this event has already been notified about. */
async function wasNotified(key) {
  const r = getClient();
  if (!r) return true; // fail closed: never spam if storage is unreachable
  const v = await r.get(`notified:${key}`);
  return v != null;
}

async function markNotified(key, ttlSeconds) {
  const r = getClient();
  if (!r) return;
  await r.set(`notified:${key}`, '1', { ex: ttlSeconds });
}

/** Last score seen for a live match, used to detect "a goal just happened". */
async function getLastScore(matchId) {
  const r = getClient();
  if (!r) return null;
  const v = await r.get(`score:${matchId}`);
  return v == null ? null : String(v);
}

async function setLastScore(matchId, scoreStr, ttlSeconds) {
  const r = getClient();
  if (!r) return;
  await r.set(`score:${matchId}`, scoreStr, { ex: ttlSeconds });
}

module.exports = {
  isConfigured,
  saveSubscription,
  updateFavorites,
  deleteSubscriptionByEndpoint,
  deleteSubscriptionById,
  listSubscriptions,
  wasNotified,
  markNotified,
  getLastScore,
  setLastScore,
};
