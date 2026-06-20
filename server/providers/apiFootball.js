'use strict';

const BASE_URL = 'https://v3.football.api-sports.io';

function leagueId() {
  return process.env.API_FOOTBALL_LEAGUE_ID || '1'; // 1 = FIFA World Cup
}

function season() {
  return process.env.API_FOOTBALL_SEASON || '2026';
}

async function request(path) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    const err = new Error(
      'API_FOOTBALL_KEY is not set. This only affects the Discipline tab — get a free key ' +
        '(no card required, 100 requests/day) at https://dashboard.api-football.com/register'
    );
    err.code = 'MISSING_KEY';
    throw err;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-apisports-key': key },
  });

  if (!res.ok) {
    const err = new Error(`API-FOOTBALL request failed (HTTP ${res.status})`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/** Top 20 players by yellow cards for the configured league/season. */
function getTopYellowCards() {
  return request(`/players/topyellowcards?league=${leagueId()}&season=${season()}`);
}

/** Top 20 players by red cards for the configured league/season. */
function getTopRedCards() {
  return request(`/players/topredcards?league=${leagueId()}&season=${season()}`);
}

module.exports = { getTopYellowCards, getTopRedCards };
