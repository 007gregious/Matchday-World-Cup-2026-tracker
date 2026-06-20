'use strict';

/**
 * These helpers do two jobs:
 *
 *  1. SHRINK — football-data.org and API-FOOTBALL responses carry a lot of
 *     fields (crests, venues, referees, full team objects, links, etc.)
 *     that the UI never uses. Stripping those down before sending JSON to
 *     the browser is one of the biggest "low data" wins in this app —
 *     often cutting payload size by more than half.
 *
 *  2. HUMANISE — turn enum-style values like "GROUP_A" or "QUARTER_FINALS"
 *     into "Group A" / "Quarter-Final" so the frontend doesn't need its own
 *     copy of this mapping.
 */

const STAGE_LABELS = {
  GROUP_STAGE: 'Group Stage',
  LEAGUE_STAGE: 'League Stage',
  LAST_32: 'Round of 32',
  ROUND_OF_32: 'Round of 32',
  LAST_16: 'Round of 16',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-Final',
  SEMI_FINALS: 'Semi-Final',
  THIRD_PLACE: 'Third-Place Play-off',
  FINAL: 'Final',
};

/** "QUARTER_FINALS" -> "Quarter-Final", with a sane fallback for anything new. */
function humanizeStage(stage) {
  if (!stage) return '';
  if (STAGE_LABELS[stage]) return STAGE_LABELS[stage];
  return stage
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** "GROUP_A" -> "Group A". Falls back to humanizeStage for non-group values. */
function humanizeGroup(group) {
  if (!group) return null;
  const m = /^GROUP_([A-Z0-9]+)$/i.exec(group);
  if (m) return `Group ${m[1]}`;
  return humanizeStage(group);
}

/** Slim a football-data.org team object down to just what the UI renders. */
function slimTeam(team) {
  if (!team) return null;
  return {
    name: team.name || team.shortName || 'TBD',
    code: team.tla || null,
  };
}

/** Slim a single football-data.org match. */
function slimMatch(m) {
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    minute: m.minute ?? null,
    stage: m.stage || null,
    stageLabel: humanizeStage(m.stage),
    group: m.group ? humanizeGroup(m.group) : null,
    matchday: m.matchday ?? null,
    home: slimTeam(m.homeTeam),
    away: slimTeam(m.awayTeam),
    score: {
      home: m.score?.fullTime?.home ?? null,
      away: m.score?.fullTime?.away ?? null,
      halfHome: m.score?.halfTime?.home ?? null,
      halfAway: m.score?.halfTime?.away ?? null,
      winner: m.score?.winner ?? null,
      duration: m.score?.duration ?? null,
    },
    venue: m.venue || null,
  };
}

/** Slim + sort (chronologically) a football-data.org matches response. */
function slimMatches(data) {
  return (data.matches || [])
    .map(slimMatch)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
}

/**
 * Slim a football-data.org standings response down to one entry per group,
 * each with a clean table. Only "TOTAL" tables are kept (HOME/AWAY splits
 * aren't useful for a wallchart view).
 */
function slimStandings(data) {
  const groups = (data.standings || [])
    .filter((s) => s.type === 'TOTAL')
    .map((s) => ({
      group: s.group ? humanizeGroup(s.group) : humanizeStage(s.stage) || 'Table',
      table: (s.table || []).map((row) => ({
        position: row.position,
        team: slimTeam(row.team),
        played: row.playedGames,
        won: row.won,
        draw: row.draw,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDiff: row.goalDifference,
        points: row.points,
        form: row.form || null,
      })),
    }));

  groups.sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true }));
  return groups;
}

/** Slim a football-data.org scorers response (includes goals + assists). */
function slimScorers(data) {
  return (data.scorers || []).map((s, i) => ({
    rank: i + 1,
    player: s.player?.name || 'Unknown',
    team: slimTeam(s.team),
    goals: s.goals ?? 0,
    assists: s.assists ?? null,
    penalties: s.penalties ?? null,
    played: s.playedMatches ?? null,
  }));
}

/** Slim one API-FOOTBALL top-cards response (topyellowcards or topredcards). */
function slimCardList(response) {
  return (response || []).map((entry, i) => {
    const stat = entry.statistics?.[0] || {};
    return {
      rank: i + 1,
      player: entry.player?.name || 'Unknown',
      team: { name: stat.team?.name || 'Unknown', code: null },
      yellow: stat.cards?.yellow ?? 0,
      red: stat.cards?.red ?? 0,
      played: stat.games?.appearences ?? null,
    };
  });
}

/** Combine API-FOOTBALL's yellow + red card responses into one slim object. */
function slimCards(yellowData, redData) {
  return {
    yellow: slimCardList(yellowData?.response),
    red: slimCardList(redData?.response),
  };
}

module.exports = {
  humanizeStage,
  humanizeGroup,
  slimTeam,
  slimMatch,
  slimMatches,
  slimStandings,
  slimScorers,
  slimCards,
};
