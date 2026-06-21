/**
 * Knockout bracket — a pure data transform only. Rendering reuses the
 * existing matchCardHTML() in app.js so the bracket view automatically
 * gets the same live-status, winner-highlight, FT/AET/Pens labels, and
 * calendar/share buttons as every other match card, for free.
 *
 * football-data.org's exact `stage` enum for the 48-team 2026 World Cup
 * format (which has a new Round of 32 not present in older 32-team
 * tournaments) isn't fully nailed down, so this is deliberately
 * defensive: known stage names get a friendly label and a sensible sort
 * order, but ANY stage string that isn't group-stage still gets shown,
 * just appended after the recognised rounds with a humanized fallback
 * label instead of silently disappearing.
 */

const ROUND_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'];

const ROUND_ALIASES = {
  LAST_32: 'ROUND_OF_32',
  LAST_16: 'ROUND_OF_16',
};

const ROUND_LABELS = {
  ROUND_OF_32: 'Round of 32',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarterfinals',
  SEMI_FINALS: 'Semifinals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
};

const EXCLUDED_STAGES = new Set(['GROUP_STAGE', 'LEAGUE_STAGE']);

function humanizeFallback(stage) {
  return stage
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * @param {Array} matches — the same slim match objects /api/matches returns
 * @returns {Array<{key:string, label:string, matches:Array}>}
 */
export function buildBracket(matches) {
  const rounds = new Map();

  for (const m of matches) {
    const raw = m.stage;
    if (!raw || EXCLUDED_STAGES.has(raw)) continue;
    const key = ROUND_ALIASES[raw] || raw;
    if (!rounds.has(key)) rounds.set(key, []);
    rounds.get(key).push(m);
  }

  const known = ROUND_ORDER.filter((r) => rounds.has(r));
  const unknown = [...rounds.keys()].filter((r) => !ROUND_ORDER.includes(r)).sort();
  const order = [...known, ...unknown];

  return order.map((key) => ({
    key,
    label: ROUND_LABELS[key] || humanizeFallback(key),
    matches: rounds.get(key).slice().sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)),
  }));
}
