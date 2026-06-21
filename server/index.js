'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const compression = require('compression');

const apiRoutes = require('./routes/api');
const pushRoutes = require('./routes/push');
const push = require('./lib/push');
const store = require('./lib/store');
const watcher = require('./lib/watcher');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Gzip everything — JSON and the static CSS/JS bundle alike. This is one
// of the cheapest, biggest wins for keeping data usage low.
app.use(compression());

// Needed for the push subscribe/unsubscribe/favorites POST routes below.
// Small JSON bodies only (a push subscription is a few hundred bytes).
app.use(express.json({ limit: '100kb' }));

// Cached proxy to football-data.org / API-FOOTBALL.
app.use('/api', apiRoutes);

// Push notification subscription management (optional feature — routes
// themselves report `available:false` cleanly if VAPID/Upstash aren't set).
app.use('/api/push', pushRoutes);

// Plain health check for uptime pingers. Deliberately does NOT call any
// external API, so you can hit this as often as you like (e.g. every
// 10 minutes to stop a free Render instance from spinning down) without
// touching your football-data.org / API-FOOTBALL quota at all.
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// Static frontend (HTML/CSS/JS, manifest, service worker, icon).
// A 1-hour cache header is a reasonable middle ground for a project with
// no build step: repeat visits within the hour cost nothing, but editing
// a file and redeploying doesn't leave anyone stuck on a stale version
// for long.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1h',
    extensions: ['html'],
  })
);

push.configure();

app.listen(PORT, () => {
  console.log(`⚽ Matchday Tracker running at http://localhost:${PORT}`);

  if (!process.env.FOOTBALL_DATA_TOKEN) {
    console.warn(
      '⚠️  FOOTBALL_DATA_TOKEN is not set — the Table, Matches and Scorers tabs will not load data.\n' +
        '   Copy .env.example to .env and add a free token from football-data.org.'
    );
  }
  if (!process.env.API_FOOTBALL_KEY) {
    console.log('ℹ️  API_FOOTBALL_KEY not set — the Discipline (cards) tab stays disabled (optional).');
  }

  if (push.isConfigured() && store.isConfigured()) {
    console.log('🔔 Push notifications enabled — kickoff reminders + goal alerts for favorited teams.');
    console.log(
      '   Note: this only fires while the server is awake. On Render\'s free tier the service ' +
        'sleeps after 15 min idle — see the README for the free keep-alive trick.'
    );
    // Small delay so this doesn't compete with the rest of startup, then
    // every 60s thereafter.
    setTimeout(() => {
      watcher.runCheck().catch((err) => console.error('[watcher]', err.message));
      setInterval(() => {
        watcher.runCheck().catch((err) => console.error('[watcher]', err.message));
      }, 60_000);
    }, 5000);
  } else {
    console.log(
      'ℹ️  Push notifications disabled (optional) — set VAPID_* and UPSTASH_REDIS_REST_* in .env to enable. See the README.'
    );
  }
});
