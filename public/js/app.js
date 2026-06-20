/**
 * Matchday — frontend logic.
 *
 * No framework, no build step: this file talks to our own /api/* endpoints
 * (which already cache + slim the upstream responses) and renders plain
 * HTML strings into the panels defined in index.html.
 *
 * Three things drive the "low data" goal from this side:
 *  1. Only the ACTIVE tab polls for fresh data — switching tabs fetches
 *     once, then starts a poll loop scoped to that tab only.
 *  2. Polling pauses while the page/tab isn't visible (screen off,
 *     backgrounded app, different browser tab).
 *  3. "Data saver" (manual toggle, or auto-detected from
 *     navigator.connection) roughly quarters how often everything polls.
 *
 * The Matches tab gets special treatment: it's the one place where "live"
 * really matters, so it always keeps a lightweight background check
 * running (even from other tabs) purely to drive the header's LIVE badge —
 * but that check shares the exact same request as the Matches tab itself,
 * so there's never a duplicate fetch.
 */

import { getFlag } from './flags.js';

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);

const COMPETITION_LABELS = {
  WC: 'World Cup 26',
  CL: 'Champions League',
  EC: 'Euros',
  PL: 'Premier League',
  PD: 'La Liga',
  BL1: 'Bundesliga',
  SA: 'Serie A',
  FL1: 'Ligue 1',
  DED: 'Eredivisie',
  PPL: 'Primeira Liga',
  ELC: 'Championship',
  CLI: 'Copa Libertadores',
  BSA: 'Brasileirão',
};

// Base poll intervals (ms). Data saver multiplies the "other tabs" and
// "idle matches" figures; live matches get a smaller, fixed multiplier so
// data saver doesn't make a live score feel stale.
const BASE_INTERVAL = {
  table: 5 * 60_000,
  scorers: 10 * 60_000,
  discipline: 60 * 60_000,
};
const MATCHES_LIVE_INTERVAL = 60_000;
const MATCHES_IDLE_INTERVAL = 5 * 60_000;
const MATCHES_BACKGROUND_INTERVAL = 3 * 60_000;
const DATA_SAVER_MULTIPLIER = 4;

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtDateHeading(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

function sameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatGoalDiff(n) {
  return n > 0 ? `+${n}` : String(n);
}

function formatAgo(date) {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function humanizeStatus(status) {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

function detectSaveData() {
  const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return typeof conn.effectiveType === 'string' && conn.effectiveType.includes('2g');
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

const state = {
  activeTab: 'matches',
  live: false,
  dataSaver: false,
  matchesData: null,
  updatedAt: {},
};

let matchesTimer = null;
let tabTimer = null;

// ---------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  $('themeBtn').setAttribute('aria-pressed', String(isLight));
  $('themeIcon').textContent = isLight ? '☀️' : '🌙';
  try {
    localStorage.setItem('matchday:theme', theme);
  } catch {
    /* localStorage unavailable — theme just won't persist */
  }
}

function initTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  $('themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });
}

// ---------------------------------------------------------------------
// Data saver
// ---------------------------------------------------------------------

function initDataSaver() {
  const checkbox = $('dataSaverToggle');
  let saved = null;
  try {
    saved = localStorage.getItem('matchday:dataSaver');
  } catch {
    /* localStorage unavailable */
  }
  state.dataSaver = saved !== null ? saved === '1' : detectSaveData();
  checkbox.checked = state.dataSaver;

  checkbox.addEventListener('change', () => {
    state.dataSaver = checkbox.checked;
    try {
      localStorage.setItem('matchday:dataSaver', state.dataSaver ? '1' : '0');
    } catch {
      /* localStorage unavailable */
    }
    // Poll loops read state.dataSaver each time they reschedule themselves,
    // so no need to restart anything — the next tick just uses the new interval.
  });
}

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------

const TABS = ['matches', 'table', 'scorers', 'discipline'];

function initTabs() {
  TABS.forEach((tab) => $(`tab-${tab}`).addEventListener('click', () => switchTab(tab)));
}

function switchTab(tab) {
  if (tab === state.activeTab) return;

  TABS.forEach((t) => {
    const selected = t === tab;
    const tabEl = $(`tab-${t}`);
    tabEl.setAttribute('aria-selected', String(selected));
    tabEl.tabIndex = selected ? 0 : -1;
    $(`panel-${t}`).hidden = !selected;
  });

  state.activeTab = tab;
  clearTimeout(tabTimer);

  if (tab === 'matches') {
    const panel = $('panel-matches');
    if (state.matchesData) renderMatches(panel, state.matchesData);
    else if (!panel.children.length) panel.innerHTML = skeletonHTML();
  } else {
    loadTab(tab, { silent: false });
    scheduleTabPoll(tab);
  }

  updateStatusBar();
}

// ---------------------------------------------------------------------
// Meta (competition label, whether the Discipline tab has a key)
// ---------------------------------------------------------------------

async function loadMeta() {
  try {
    const meta = await getJSON('/api/meta');
    const label = COMPETITION_LABELS[meta.competition] || meta.competition;
    $('competitionTag').textContent = label.toUpperCase();
    if (meta.cardsEnabled) $('cardsCredit').textContent = ' and API-FOOTBALL';
  } catch {
    /* purely cosmetic — fine to leave the default label */
  }
}

// ---------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------

function markUpdated(tab, updatedAtIso) {
  state.updatedAt[tab] = updatedAtIso ? new Date(updatedAtIso) : new Date();
}

function updateStatusBar() {
  const updated = state.updatedAt[state.activeTab];
  const liveBadge = state.live
    ? '<span class="status-bar__live"><span class="live-dot" aria-hidden="true"></span>Live</span>'
    : '';
  const agoText = updated ? `Updated ${formatAgo(updated)}` : 'Loading…';
  $('statusText').innerHTML = [liveBadge, esc(agoText)].filter(Boolean).join(' &middot; ');
}

function setRefreshing(isLoading) {
  $('refreshBtn').dataset.loading = isLoading ? 'true' : 'false';
}

// ---------------------------------------------------------------------
// Generic states (skeleton / empty / error)
// ---------------------------------------------------------------------

function skeletonHTML() {
  return '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
}

function stateCardHTML({ title, body, actionHref, actionLabel }) {
  return `<div class="state-card">
    <span class="state-card__title">${esc(title)}</span>
    <p>${body}</p>
    ${
      actionHref
        ? `<a class="state-card__action" href="${esc(actionHref)}" target="_blank" rel="noopener">${esc(actionLabel)}</a>`
        : ''
    }
  </div>`;
}

/** Renders the `{ available: false, reason, message }` shape every /api/* route can return. */
function renderUnavailable(panel, data) {
  if (data.reason === 'missing_key') {
    if (/FOOTBALL_DATA_TOKEN/.test(data.message || '')) {
      panel.innerHTML = stateCardHTML({
        title: 'Add your football-data.org key',
        body:
          'This needs a free <code>FOOTBALL_DATA_TOKEN</code>. Copy <code>.env.example</code> to ' +
          '<code>.env</code>, add your token, then restart the server — see the README for the ' +
          '30-second signup link.',
      });
    } else {
      panel.innerHTML = stateCardHTML({
        title: 'Discipline stats are optional',
        body:
          'Add a free <code>API_FOOTBALL_KEY</code> (100 requests/day, no card required) to your ' +
          '<code>.env</code> to show yellow and red card rankings here. Everything else in Matchday ' +
          'works fine without it.',
        actionHref: 'https://dashboard.api-football.com/register',
        actionLabel: 'Get a free API-FOOTBALL key',
      });
    }
    return;
  }
  panel.innerHTML = stateCardHTML({
    title: "Couldn't load this",
    body: `${esc(data.message || 'The upstream API did not respond as expected.')} Try the Refresh button above in a moment.`,
  });
}

function renderError(panel, err) {
  panel.innerHTML = stateCardHTML({
    title: 'Connection problem',
    body: `Couldn't reach the server (${esc(err.message)}). Check your connection, then try Refresh above.`,
  });
}

// ---------------------------------------------------------------------
// Render: Matches
// ---------------------------------------------------------------------

function renderMatches(panel, matches) {
  if (!matches.length) {
    panel.innerHTML = stateCardHTML({
      title: 'Nothing scheduled',
      body: 'football-data.org returned no fixtures for this competition right now.',
    });
    return;
  }

  const now = new Date();
  const live = [];
  const today = [];
  const upcoming = [];
  const results = [];

  for (const m of matches) {
    if (LIVE_STATUSES.has(m.status)) {
      live.push(m);
      continue;
    }
    const date = new Date(m.utcDate);
    if (sameLocalDay(date, now)) today.push(m);
    else if (date > now) upcoming.push(m);
    else results.push(m);
  }
  results.reverse(); // most recent result first

  let html = '';
  if (live.length) html += matchListSection('Live now', live);
  if (today.length) html += matchListSection('Today', today);
  if (upcoming.length) html += groupedMatchSection('Upcoming', upcoming);
  if (results.length) html += groupedMatchSection('Results', results);

  panel.innerHTML = html;
}

function matchListSection(title, items) {
  const listClass = items.length === 1 ? 'match-list match-list--single' : 'match-list';
  return `<h2 class="section-title">${esc(title)} <span class="count">${items.length}</span></h2>
    <div class="${listClass}">${items.map(matchCardHTML).join('')}</div>`;
}

function groupedMatchSection(title, items) {
  const groups = new Map();
  for (const m of items) {
    const key = new Date(m.utcDate).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  let body = '';
  for (const group of groups.values()) {
    body += `<div class="match-group__date">${esc(fmtDateHeading(group[0].utcDate))}</div>`;
    body += group.map(matchCardHTML).join('');
  }

  return `<details class="match-group">
    <summary>${esc(title)} <span class="count">${items.length}</span></summary>
    <div class="match-group__body">${body}</div>
  </details>`;
}

function matchCardHTML(m) {
  const live = LIVE_STATUSES.has(m.status);
  const home = m.home || { name: 'TBD' };
  const away = m.away || { name: 'TBD' };
  const homeScore = m.score.home ?? '–';
  const awayScore = m.score.away ?? '–';

  const tagParts = [];
  if (m.group) tagParts.push(m.group);
  else if (m.stageLabel) tagParts.push(m.stageLabel);
  if (m.matchday) tagParts.push(`MD ${m.matchday}`);
  const tag = tagParts.join(' &middot; ') || '\u2014';

  let statusHTML;
  if (live) {
    const label = m.minute ? `${m.minute}'` : 'Live';
    statusHTML = `<span class="match-card__status match-card__status--live"><span class="live-dot" aria-hidden="true"></span>${esc(label)}</span>`;
  } else if (m.status === 'FINISHED') {
    const suffix =
      m.score.duration === 'PENALTY_SHOOTOUT' ? ' &middot; Pens' : m.score.duration === 'EXTRA_TIME' ? ' &middot; AET' : '';
    statusHTML = `<span class="match-card__status">FT${suffix}</span>`;
  } else if (['POSTPONED', 'SUSPENDED', 'CANCELLED', 'AWARDED'].includes(m.status)) {
    statusHTML = `<span class="match-card__status">${esc(humanizeStatus(m.status))}</span>`;
  } else {
    statusHTML = `<span class="match-card__status">${esc(fmtTime(m.utcDate))}</span>`;
  }

  return `<article class="match-card" data-live="${live}">
    <div class="match-card__meta">
      <span class="match-card__tag">${tag}</span>
      ${statusHTML}
    </div>
    ${matchCardTeamRow(home, homeScore, m.score.winner === 'HOME_TEAM')}
    ${matchCardTeamRow(away, awayScore, m.score.winner === 'AWAY_TEAM')}
    <div class="match-card__footer">
      <span>${esc(m.venue || m.stageLabel || '')}</span>
      <span>${esc(fmtDateTime(m.utcDate))}</span>
    </div>
  </article>`;
}

function matchCardTeamRow(team, score, isWinner) {
  return `<div class="match-card__team">
    <span class="match-card__flag" aria-hidden="true">${getFlag(team.name)}</span>
    <span class="match-card__name${isWinner ? ' match-card__name--winner' : ''}">${esc(team.name)}</span>
    <span class="match-card__score">${esc(score)}</span>
  </div>`;
}

// ---------------------------------------------------------------------
// Render: Table (standings)
// ---------------------------------------------------------------------

function renderStandings(panel, groups) {
  if (!groups.length) {
    panel.innerHTML = stateCardHTML({
      title: 'No table yet',
      body: 'Group standings will appear here once matches kick off.',
    });
    return;
  }

  const legend = `<div class="legend">
    <span><span class="legend__swatch legend__swatch--advance" aria-hidden="true"></span>Advances to knockouts</span>
    <span><span class="legend__swatch legend__swatch--playoff" aria-hidden="true"></span>Possible 3rd-place qualifier</span>
  </div>`;

  const blocks = groups
    .map(
      (g) => `<div class="group-block">
        <h2 class="group-block__title">${esc(g.group)}</h2>
        <div class="table-wrap">
          <table class="standings">
            <thead>
              <tr>
                <th class="team-cell">Team</th>
                <th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>${g.table.map(standingsRowHTML).join('')}</tbody>
          </table>
        </div>
      </div>`
    )
    .join('');

  panel.innerHTML = legend + blocks;
}

function standingsRowHTML(row) {
  const zone = row.position <= 2 ? 'advance' : row.position === 3 ? 'playoff' : '';
  const name = row.team?.name || 'TBD';
  return `<tr${zone ? ` data-zone="${zone}"` : ''}>
    <td class="team-cell"><span class="team-cell__inner">
      <span class="match-card__flag" aria-hidden="true">${getFlag(name)}</span>${esc(name)}
    </span></td>
    <td class="num">${row.played}</td>
    <td class="num">${row.won}</td>
    <td class="num">${row.draw}</td>
    <td class="num">${row.lost}</td>
    <td class="num">${formatGoalDiff(row.goalDiff)}</td>
    <td class="pts">${row.points}</td>
  </tr>`;
}

// ---------------------------------------------------------------------
// Render: Scorers
// ---------------------------------------------------------------------

function renderScorers(panel, scorers) {
  if (!scorers.length) {
    panel.innerHTML = stateCardHTML({
      title: 'No scorers yet',
      body: 'Goal and assist leaders will appear once group matches have been played.',
    });
    return;
  }

  const rows = scorers
    .map(
      (s) => `<li class="rank-row">
        <span class="rank-row__num">${s.rank}</span>
        <div class="rank-row__player">
          <div class="rank-row__name">${esc(s.player)}</div>
          ${rankRowTeam(s.team)}
        </div>
        <div class="rank-row__stats">
          <div class="stat-chip"><b>${s.goals}</b><label>Goals</label></div>
          ${s.assists != null ? `<div class="stat-chip"><b>${s.assists}</b><label>Assists</label></div>` : ''}
        </div>
      </li>`
    )
    .join('');

  panel.innerHTML = `<h2 class="section-title">Goals &amp; Assists <span class="count">${scorers.length}</span></h2>
    <ul class="rank-list">${rows}</ul>`;
}

function rankRowTeam(team) {
  const name = team?.name || '';
  return `<div class="rank-row__team"><span class="match-card__flag" aria-hidden="true">${getFlag(name)}</span>${esc(name)}</div>`;
}

// ---------------------------------------------------------------------
// Render: Discipline (cards)
// ---------------------------------------------------------------------

function renderDiscipline(panel, data) {
  const yellow = data.yellow || [];
  const red = data.red || [];

  if (!yellow.length && !red.length) {
    panel.innerHTML = stateCardHTML({
      title: 'No cards yet',
      body: 'Card rankings will appear once matches have been played.',
    });
    return;
  }

  let html = `<h2 class="section-title">Most Yellow Cards <span class="count">${yellow.length}</span></h2>
    <ul class="rank-list">${yellow.map((p) => disciplineRowHTML(p, 'yellow')).join('')}</ul>`;

  if (red.length) {
    html += `<h2 class="section-title">Most Red Cards <span class="count">${red.length}</span></h2>
      <ul class="rank-list">${red.map((p) => disciplineRowHTML(p, 'red')).join('')}</ul>`;
  } else {
    html += '<p class="muted-note">No red cards yet.</p>';
  }

  panel.innerHTML = html;
}

function disciplineRowHTML(p, type) {
  const value = type === 'yellow' ? p.yellow : p.red;
  const label = type === 'yellow' ? 'Yellow' : 'Red';
  return `<li class="rank-row">
    <span class="rank-row__num">${p.rank}</span>
    <div class="rank-row__player">
      <div class="rank-row__name">${esc(p.player)}</div>
      ${rankRowTeam(p.team)}
    </div>
    <div class="rank-row__stats">
      <div class="stat-chip stat-chip--${type}"><b>${value}</b><label>${label}</label></div>
    </div>
  </li>`;
}

// ---------------------------------------------------------------------
// Loading a tab's data
// ---------------------------------------------------------------------

async function loadTab(tab, { silent }) {
  const panel = $(`panel-${tab}`);
  if (!silent && !panel.children.length) panel.innerHTML = skeletonHTML();
  setRefreshing(true);

  try {
    if (tab === 'table') {
      const data = await getJSON('/api/standings');
      if (data.available) renderStandings(panel, data.groups);
      else renderUnavailable(panel, data);
      markUpdated(tab, data.updatedAt);
    } else if (tab === 'scorers') {
      const data = await getJSON('/api/scorers');
      if (data.available) renderScorers(panel, data.scorers);
      else renderUnavailable(panel, data);
      markUpdated(tab, data.updatedAt);
    } else if (tab === 'discipline') {
      const data = await getJSON('/api/cards');
      if (data.available) renderDiscipline(panel, data);
      else renderUnavailable(panel, data);
      markUpdated(tab, data.updatedAt);
    }
  } catch (err) {
    if (!panel.children.length) renderError(panel, err);
  } finally {
    setRefreshing(false);
    updateStatusBar();
  }
}

// ---------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------

function matchesInterval() {
  const active = state.activeTab === 'matches';
  if (!active) return state.dataSaver ? MATCHES_BACKGROUND_INTERVAL * DATA_SAVER_MULTIPLIER : MATCHES_BACKGROUND_INTERVAL;
  const base = state.live ? MATCHES_LIVE_INTERVAL : MATCHES_IDLE_INTERVAL;
  return state.dataSaver ? base * DATA_SAVER_MULTIPLIER : base;
}

function otherTabInterval(tab) {
  const base = BASE_INTERVAL[tab] || BASE_INTERVAL.table;
  return state.dataSaver ? base * DATA_SAVER_MULTIPLIER : base;
}

/** Always-running loop: fetches /api/matches, renders if Matches is active, and keeps the LIVE badge accurate either way. */
async function pollMatches() {
  clearTimeout(matchesTimer);

  if (!document.hidden) {
    try {
      const data = await getJSON('/api/matches');
      if (data.available) {
        state.matchesData = data.matches;
        state.live = !!data.live;
        markUpdated('matches', data.updatedAt);
        if (state.activeTab === 'matches') renderMatches($('panel-matches'), data.matches);
      } else {
        state.live = false;
        if (state.activeTab === 'matches') renderUnavailable($('panel-matches'), data);
      }
    } catch (err) {
      if (state.activeTab === 'matches' && !state.matchesData) renderError($('panel-matches'), err);
    }
    updateStatusBar();
  }

  matchesTimer = setTimeout(pollMatches, matchesInterval());
}

/** Self-rescheduling poll loop for whichever non-Matches tab is currently active. */
function scheduleTabPoll(tab) {
  tabTimer = setTimeout(async () => {
    if (state.activeTab === tab && !document.hidden) await loadTab(tab, { silent: true });
    if (state.activeTab === tab) scheduleTabPoll(tab);
  }, otherTabInterval(tab));
}

function handleVisibilityChange() {
  if (document.hidden) return;
  // Coming back into view: refresh whatever's on screen right away.
  if (state.activeTab === 'matches') pollMatches();
  else loadTab(state.activeTab, { silent: true });
}

// ---------------------------------------------------------------------
// Service worker (caches the app shell for near-zero repeat-visit cost)
// ---------------------------------------------------------------------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline-shell caching is a bonus, not a requirement */
    });
  });
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------

function init() {
  initTheme();
  initDataSaver();
  initTabs();
  loadMeta();
  registerServiceWorker();

  $('refreshBtn').addEventListener('click', () => {
    if (state.activeTab === 'matches') pollMatches();
    else loadTab(state.activeTab, { silent: true });
  });

  document.addEventListener('visibilitychange', handleVisibilityChange);
  setInterval(updateStatusBar, 15_000);

  $('panel-matches').innerHTML = skeletonHTML();
  pollMatches();
}

init();
