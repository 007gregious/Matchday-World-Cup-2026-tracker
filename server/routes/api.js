'use strict';

const express = require('express');
const cache = require('../cache');
const footballData = require('../providers/footballData');
const apiFootball = require('../providers/apiFootball');
const {
  slimStandings,
  slimMatches,
  slimScorers,
  slimCards,
} = require('../lib/transform');

const router = express.Router();

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);

// How long we trust our own cache before asking the upstream API again.
// These numbers are deliberately conservative: football-data.org allows
// 10 requests/minute and API-FOOTBALL's free plan allows 100/day, and we
// want to stay nowhere near either limit no matter how many people/tabs
// are polling this server.
const TTL = {
  MATCHES_LIVE: 45 * 1000, // while any match is in play, refresh every 45s
  MATCHES_IDLE: 5 * 60 * 1000, // otherwise, every 5 minutes
  STANDINGS: 5 * 60 * 1000, // table only changes when a match ends
  SCORERS: 10 * 60 * 1000, // goal/assist leaders change slowly
  CARDS: 3 * 60 * 60 * 1000, // cards change slowest of all — every 3 hours
};

function sendError(res, err) {
  if (err.code === 'MISSING_KEY') {
    // Not a crash — just "this feature isn't configured yet".
    return res.json({ available: false, reason: 'missing_key', message: err.message });
  }
  console.error('[api]', err.message);
  // Still HTTP 200: our server handled the request fine, the UPSTREAM api
  // didn't. `available:false` + `reason` is the signal the frontend acts
  // on — a non-2xx here would make getJSON() throw before it ever saw
  // this body, and the user would get a generic error instead of this
  // specific, actionable one.
  return res.json({ available: false, reason: 'upstream_error', message: err.message });
}

router.get('/standings', async (req, res) => {
  try {
    let groups = cache.get('standings');
    if (!groups) {
      const raw = await footballData.getStandings();
      groups = cache.set('standings', slimStandings(raw), TTL.STANDINGS);
    }
    res.json({ available: true, groups, updatedAt: cache.updatedAt('standings') });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/matches', async (req, res) => {
  try {
    let matches = cache.get('matches');
    if (!matches) {
      const raw = await footballData.getMatches();
      matches = slimMatches(raw);
      const live = matches.some((m) => LIVE_STATUSES.has(m.status));
      const ttl = live ? TTL.MATCHES_LIVE : TTL.MATCHES_IDLE;
      cache.set('matches', matches, ttl);
      cache.set('matchesLive', live, ttl);
    }
    res.json({
      available: true,
      matches,
      live: !!cache.get('matchesLive'),
      updatedAt: cache.updatedAt('matches'),
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/scorers', async (req, res) => {
  try {
    let scorers = cache.get('scorers');
    if (!scorers) {
      const raw = await footballData.getScorers(25);
      scorers = cache.set('scorers', slimScorers(raw), TTL.SCORERS);
    }
    res.json({ available: true, scorers, updatedAt: cache.updatedAt('scorers') });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/cards', async (req, res) => {
  if (!process.env.API_FOOTBALL_KEY) {
    return res.json({
      available: false,
      reason: 'missing_key',
      message:
        'Discipline stats are optional. Add a free API_FOOTBALL_KEY (100 requests/day, ' +
        'no card required) to enable this tab — see the README.',
    });
  }
  try {
    let cards = cache.get('cards');
    if (!cards) {
      const [yellow, red] = await Promise.all([
        apiFootball.getTopYellowCards(),
        apiFootball.getTopRedCards(),
      ]);
      cards = cache.set('cards', slimCards(yellow, red), TTL.CARDS);
    }
    res.json({ available: true, ...cards, updatedAt: cache.updatedAt('cards') });
  } catch (err) {
    sendError(res, err);
  }
});

/** Small bit of config the frontend needs to label things correctly. */
router.get('/meta', (req, res) => {
  res.json({
    competition: footballData.competitionCode(),
    cardsEnabled: !!process.env.API_FOOTBALL_KEY,
    serverTime: new Date().toISOString(),
  });
});

module.exports = router;
