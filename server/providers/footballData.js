'use strict';

const BASE_URL = 'https://api.football-data.org/v4';

function competitionCode() {
  return process.env.COMPETITION_CODE || 'WC';
}

async function request(path) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    const err = new Error(
      'FOOTBALL_DATA_TOKEN is not set. Get a free key at ' +
        'https://www.football-data.org/client/register and add it to your .env file ' +
        '(or your Render environment variables).'
    );
    err.code = 'MISSING_KEY';
    throw err;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': token },
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.message || '';
    } catch {
      // ignore non-JSON error bodies
    }
    const err = new Error(
      `football-data.org request failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`
    );
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/** Group standings / table for the configured competition. */
function getStandings() {
  return request(`/competitions/${competitionCode()}/standings`);
}

/**
 * Matches (fixtures + live scores + results) for the configured competition.
 * @param {Record<string,string>} [filters] e.g. { status: 'LIVE' }
 */
function getMatches(filters = {}) {
  const qs = new URLSearchParams(filters).toString();
  return request(`/competitions/${competitionCode()}/matches${qs ? `?${qs}` : ''}`);
}

/** Top scorers (goals + assists + penalties) for the configured competition. */
function getScorers(limit = 25) {
  return request(`/competitions/${competitionCode()}/scorers?limit=${limit}`);
}

module.exports = { getStandings, getMatches, getScorers, competitionCode };
