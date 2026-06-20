'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const compression = require('compression');

const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');

// Gzip everything — JSON and the static CSS/JS bundle alike. This is one
// of the cheapest, biggest wins for keeping data usage low.
app.use(compression());

// Cached proxy to football-data.org / API-FOOTBALL.
app.use('/api', apiRoutes);

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
});
