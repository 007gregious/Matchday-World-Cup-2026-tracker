'use strict';

const push = require('./push');
const store = require('./store');
const { getCachedMatches, LIVE_STATUSES } = require('./matches');

// Send a kickoff reminder once a match is this close to starting.
const KICKOFF_WINDOW_MS = 15 * 60 * 1000;
// How long dedupe markers live — long enough that a single match's
// lifecycle can never trigger a duplicate, short enough not to grow
// Redis usage forever.
const ONE_DAY_SECONDS = 24 * 60 * 60;
const SIX_HOURS_SECONDS = 6 * 60 * 60;

function teamIsFavorited(team, favorites) {
  return !!team && favorites.includes(team.name);
}

/** Sends one payload to every subscriber who has favorited either side of this match. */
async function notifySubsForMatch(subs, m, payload) {
  const relevant = subs.filter(
    (s) => teamIsFavorited(m.home, s.favorites) || teamIsFavorited(m.away, s.favorites)
  );
  await Promise.all(relevant.map((s) => push.sendToRecord(s, payload)));
}

async function checkKickoffs(matches, subs) {
  const now = Date.now();
  for (const m of matches) {
    if (m.status !== 'TIMED' && m.status !== 'SCHEDULED') continue;
    const msUntilKickoff = new Date(m.utcDate).getTime() - now;
    if (msUntilKickoff <= 0 || msUntilKickoff > KICKOFF_WINDOW_MS) continue;

    const key = `kickoff:${m.id}`;
    if (await store.wasNotified(key)) continue;

    await notifySubsForMatch(subs, m, {
      title: '⏰ Kicking off soon',
      body: `${m.home?.name || 'TBD'} vs ${m.away?.name || 'TBD'} kicks off at ${new Date(
        m.utcDate
      ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      url: '/',
      tag: `kickoff-${m.id}`,
    });
    await store.markNotified(key, ONE_DAY_SECONDS);
  }
}

async function checkScoreChanges(matches, subs) {
  for (const m of matches) {
    if (!LIVE_STATUSES.has(m.status)) continue;
    if (m.score.home == null || m.score.away == null) continue;

    const current = `${m.score.home}-${m.score.away}`;
    const previous = await store.getLastScore(m.id);

    // Only notify if we'd already seen a DIFFERENT score before — this
    // skips the very first observation of a freshly-kicked-off 0-0 match,
    // so kickoff itself never gets mistaken for a goal.
    if (previous !== null && previous !== current) {
      await notifySubsForMatch(subs, m, {
        title: '⚽ Goal!',
        body: `${m.home?.name || 'TBD'} ${current.replace('-', '–')} ${m.away?.name || 'TBD'}${
          m.minute ? ` (${m.minute}')` : ''
        }`,
        url: '/',
        tag: `score-${m.id}`,
      });
    }
    await store.setLastScore(m.id, current, SIX_HOURS_SECONDS);
  }
}

async function checkFullTime(matches, subs) {
  for (const m of matches) {
    if (m.status !== 'FINISHED') continue;
    const key = `final:${m.id}`;
    if (await store.wasNotified(key)) continue;

    await notifySubsForMatch(subs, m, {
      title: '🏁 Full time',
      body: `${m.home?.name || 'TBD'} ${m.score.home}–${m.score.away} ${m.away?.name || 'TBD'}`,
      url: '/',
      tag: `final-${m.id}`,
    });
    await store.markNotified(key, ONE_DAY_SECONDS);
  }
}

/**
 * One pass: fetch the (cached) match list, and for anyone subscribed,
 * send a push if one of their favorited teams just kicked off, scored, or
 * finished a match.
 *
 * IMPORTANT — this only does anything while the server process is
 * actually running. Render's free tier sleeps after 15 minutes of no
 * HTTP traffic, which pauses this loop along with everything else. If
 * you want notifications to arrive reliably even when nobody currently
 * has the app open, see the README section on keeping the free instance
 * awake with a free uptime pinger.
 */
async function runCheck() {
  if (!push.isConfigured() || !store.isConfigured()) return;

  let matches;
  try {
    matches = await getCachedMatches();
  } catch {
    return; // upstream hiccup or missing FOOTBALL_DATA_TOKEN — try again next tick
  }

  const subs = await store.listSubscriptions().catch(() => []);
  if (!subs.length) return;

  await checkKickoffs(matches, subs);
  await checkScoreChanges(matches, subs);
  await checkFullTime(matches, subs);
}

module.exports = { runCheck };
