'use strict';

const webpush = require('web-push');
const store = require('./store');

let configured = false;

/** Call once at boot. Safe to call even if the VAPID env vars aren't set or are malformed. */
function configure() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    configured = false;
    return;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (err) {
    // A malformed key here must NEVER take down the whole server — push
    // notifications are an optional feature, not a boot dependency.
    console.error(
      `⚠️  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY look invalid (${err.message}). ` +
        'Push notifications are disabled. Regenerate them with `npm run vapid:generate`.'
    );
    configured = false;
  }
}

function isConfigured() {
  return configured;
}

function publicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Send one push payload to one stored subscription record.
 * Returns true on success. On a 404/410 (the push service telling us this
 * subscription is dead — permission revoked, browser data cleared, etc.)
 * it cleans the dead subscription out of storage so we stop wasting
 * requests on it.
 */
async function sendToRecord(record, payload) {
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await store.deleteSubscriptionById(record.id).catch(() => {});
    } else {
      console.error('[push] send failed:', err.message);
    }
    return false;
  }
}

module.exports = { configure, isConfigured, publicKey, sendToRecord };
