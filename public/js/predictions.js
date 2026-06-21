/**
 * Score predictions — a single-player, fully client-side prediction game.
 * No accounts, no server storage, no leaderboard: predictions live in
 * localStorage and are scored against real results pulled from the same
 * /api/matches data the rest of the app already uses (zero extra network
 * calls). Classic scoring: 3 points for an exact score, 1 point for
 * correctly calling the result (win/draw/loss), 0 for a miss.
 */

const KEY = 'matchday:predictions';

export function getPredictions() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getPrediction(matchId) {
  return getPredictions()[matchId] || null;
}

export function setPrediction(matchId, home, away) {
  const all = getPredictions();
  all[matchId] = { home, away };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* localStorage unavailable — prediction just won't persist this session */
  }
}

/** Returns 3 (exact score), 1 (correct result), 0 (miss), or null if not scoreable yet. */
export function scorePrediction(prediction, match) {
  if (!prediction || match.score?.home == null || match.score?.away == null) return null;
  const actualHome = match.score.home;
  const actualAway = match.score.away;

  if (prediction.home === actualHome && prediction.away === actualAway) return 3;

  const predictedOutcome = Math.sign(prediction.home - prediction.away);
  const actualOutcome = Math.sign(actualHome - actualAway);
  return predictedOutcome === actualOutcome ? 1 : 0;
}

/** Running personal total across every finished match with a saved prediction. */
export function tally(matches) {
  let points = 0;
  let scored = 0;
  for (const m of matches) {
    if (m.status !== 'FINISHED') continue;
    const prediction = getPrediction(m.id);
    if (!prediction) continue;
    const pts = scorePrediction(prediction, m);
    if (pts != null) {
      points += pts;
      scored += 1;
    }
  }
  return { points, scored };
}
