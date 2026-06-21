'use strict';

const express = require('express');
const push = require('../lib/push');
const store = require('../lib/store');

const router = express.Router();

/** The frontend needs this to call pushManager.subscribe(). */
router.get('/public-key', (req, res) => {
  if (!push.isConfigured()) {
    return res.json({
      available: false,
      reason: 'missing_key',
      message: 'Push notifications need VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY set on the server — see the README.',
    });
  }
  res.json({ available: true, publicKey: push.publicKey() });
});

router.post('/subscribe', async (req, res) => {
  if (!store.isConfigured()) {
    return res.status(503).json({
      ok: false,
      message: 'Storage not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN missing).',
    });
  }
  const { subscription, favorites } = req.body || {};
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ ok: false, message: 'Missing subscription.' });
  }
  try {
    await store.saveSubscription(subscription, Array.isArray(favorites) ? favorites : []);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ ok: false, message: 'Missing endpoint.' });
  await store.deleteSubscriptionByEndpoint(endpoint).catch(() => {});
  res.json({ ok: true });
});

/** Keeps server-side targeting in sync whenever favorites change on the client. */
router.post('/favorites', async (req, res) => {
  if (!store.isConfigured()) return res.status(503).json({ ok: false });
  const { endpoint, favorites } = req.body || {};
  if (!endpoint) return res.status(400).json({ ok: false, message: 'Missing endpoint.' });
  const updated = await store.updateFavorites(endpoint, Array.isArray(favorites) ? favorites : []).catch(() => false);
  res.json({ ok: updated });
});

module.exports = router;
