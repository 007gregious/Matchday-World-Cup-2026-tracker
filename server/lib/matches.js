'use strict';

const cache = require('../cache');
const footballData = require('../providers/footballData');
const { slimMatches } = require('./transform');

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);

const TTL_LIVE = 45 * 1000; // while any match is in play, refresh every 45s
const TTL_IDLE = 5 * 60 * 1000; // otherwise, every 5 minutes

/**
 * Fetch matches for the configured competition, respecting the shared TTL
 * cache. This is the SINGLE source of truth for match data on the server —
 * both the `/api/matches` route and the push-notification watcher call this
 * exact function, so polling from many browser tabs *and* the background
 * watcher never costs more than one upstream request per cache window.
 */
async function getCachedMatches() {
  let matches = cache.get('matches');
  if (!matches) {
    const raw = await footballData.getMatches();
    matches = slimMatches(raw);
    const live = matches.some((m) => LIVE_STATUSES.has(m.status));
    const ttl = live ? TTL_LIVE : TTL_IDLE;
    cache.set('matches', matches, ttl);
    cache.set('matchesLive', live, ttl);
  }
  return matches;
}

/** Whether the most recently cached matches snapshot has any match in play. */
function isLiveCached() {
  return !!cache.get('matchesLive');
}

module.exports = { getCachedMatches, isLiveCached, LIVE_STATUSES };
