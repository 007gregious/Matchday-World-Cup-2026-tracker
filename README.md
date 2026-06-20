# Matchday — Live World Cup 2026 Tracker (and beyond)

A small, fast, **$0-to-run** web app for following the World Cup: a live group
table, fixtures/results with kickoff times shown in *your* timezone, a
goals & assists leaderboard, and a yellow/red card leaderboard — all pulled
from real, trusted data sources, and designed from the ground up to be gentle
on mobile data.

No build step, no framework, no database. A tiny Node/Express server caches
and trims responses from [football-data.org](https://www.football-data.org)
(and optionally [API-FOOTBALL](https://www.api-football.com)), and a plain
HTML/CSS/JS frontend renders them into a mobile-first, installable app.

## Features

- **Live scores & fixtures** — grouped into Live now / Today / Upcoming /
  Results, with every kickoff time shown in your device's local timezone
- **Group table** for all 12 groups, with qualification zones highlighted
- **Goals & assists** leaderboard
- **Yellow/red card** leaderboard (optional — needs one extra free key)
- **Dark/light theme**, installable to your home screen, looks right on
  phones, tablets and desktops
- **Built for low data**: emoji flags (zero bytes), system fonts (zero
  downloads), gzip on every response, a service worker that caches the app
  shell, polling that backs off when nothing's live, and a "data saver"
  toggle that auto-enables on slow connections

## How it's built

```makefile
Browser  <-- /api/* -->  Your Express server  <--->  football-data.org
 (polls the                 (caches + trims          (table, fixtures, scorers)
  active tab only)            responses)        <--->  API-FOOTBALL (cards only,
                                                          optional)
```

Why a server in between, instead of calling the APIs straight from the
browser?

- Your API keys stay server-side, never shipped to the browser.
- One server-side cache serves every visitor/tab/device, so no matter how
  often the UI polls, the upstream APIs get called far less — comfortably
  inside both free tiers.
- The server strips each response down to only the fields the UI uses,
  often cutting payload size by more than half before it ever reaches your
  phone.

### Caching strategy

| Endpoint          |  Cache TTL                              | Why                                                    |
| ----------------- | --------------------------------------- | ------------------------------------------------------ |
| `/api/matches`    | 45s while any match is live, 5 min otherwise | the one thing that genuinely needs to feel "live" |
| `/api/standings`  |  5 min                                   | the table only changes when a match ends               |
| `/api/scorers`     | 10 min                                  | goal/assist leaders change slowly                       |
| `/api/cards`       | 3 hours                                 | API-FOOTBALL's free tier is 100 req/day — this alone uses ~16/day |

### Low-data techniques used throughout

- Flags are rendered as **emoji**, not images — zero network requests, crisp
  at any size, themeable for free.
- **System fonts only** (`system-ui`, `ui-monospace`) — no font files to
  download.
- `compression` middleware **gzips every response**, JSON and static
  assets alike.
- `public/sw.js` is a service worker that caches the HTML/CSS/JS app shell,
  so a repeat visit can paint instantly from cache.
- Only the **active tab polls**. Switching tabs fetches once; background
  tabs don't fetch at all.
- Polling **pauses while the page isn't visible** (screen off, app
  backgrounded, different browser tab).
- A **"Data saver"** toggle (top of the page) roughly quarters every polling
  interval — and turns itself on automatically if your browser reports
  `navigator.connection.saveData` or a 2G connection.

## Quick start

### 1. Get a free API key (about 30 seconds)

This app needs **one** key, and can optionally use a **second**:

- **Required** — [football-data.org: register here](https://www.football-data.org/client/register).
  Just an email address; your token arrives by email. The World Cup
  competition is **free forever** on their free plan (10 requests/minute,
  which the caching above keeps you nowhere near).
- **Optional** — [API-FOOTBALL: register here](https://dashboard.api-football.com/register).
  Free, no card required, 100 requests/day. This only powers the
  **Discipline** (cards) tab — football-data.org's plan doesn't include card
  rankings. Everything else works fine without this.

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and paste in your `FOOTBALL_DATA_TOKEN` (and `API_FOOTBALL_KEY`
if you got one — leave it blank to skip the Discipline tab).

### 3. Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>.

`npm run dev` restarts automatically on file changes (uses Node's built-in
`--watch`, no extra dependency).

## Project structure

```makefile
matchday-tracker/
├── server/
│   ├── index.js              # Express app: static files, gzip, /healthz
│   ├── cache.js              # tiny in-memory TTL cache
│   ├── routes/api.js         # /api/standings, /matches, /scorers, /cards, /meta
│   ├── providers/
│   │   ├── footballData.js   # football-data.org client
│   │   └── apiFootball.js     # API-FOOTBALL client (cards only)
│   └── lib/transform.js      # shrinks + humanises upstream responses
├── public/
│   ├── index.html
│   ├── manifest.json          # "Add to Home Screen" support
│   ├── icon.svg
│   ├── sw.js                  # app-shell cache (service worker)
│   ├── css/styles.css         # all styling, theming via CSS variables
│   └── js/
│       ├── app.js             # all frontend logic (no framework)
│       └── flags.js           # country name -> emoji flag lookup
├── .env.example
├── render.yaml                # optional Render Blueprint
└── package.json
```

## Deploying

### Push to GitHub

```bash
git init
git add .
git commit -m "Matchday: World Cup 2026 tracker"
git branch -M main
git remote add origin https://github.com/<you>/matchday-tracker.git
git push -u origin main
```

`.env` is git-ignored on purpose — **never commit your API keys**. Render
holds them as environment variables instead (see below).

### Deploy to Render (free)

**Option A — Dashboard, no YAML needed**

1. On [render.com](https://render.com): **New** → **Web Service** → connect
   your GitHub repo.
2. Environment: **Node**. Build command: `npm install`. Start command:
   `npm start`.
3. Instance type: **Free**.
4. Add environment variables: `FOOTBALL_DATA_TOKEN` (and `API_FOOTBALL_KEY`,
   `COMPETITION_CODE`, etc. if you're using them).
5. Create Web Service. Render builds and deploys, giving you a
   `https://your-app.onrender.com` URL.

**Option B — Blueprint**

This repo includes `render.yaml`. In Render, choose **New** → **Blueprint**
and point it at your repo — Render reads the file and creates the service
for you. You'll still be prompted to paste in `FOOTBALL_DATA_TOKEN` /
`API_FOOTBALL_KEY` directly in the dashboard (they're marked `sync: false`
so they're never stored in the repo).

### About Render's free tier

Free web services spin down after 15 minutes with no traffic and take
30-60 seconds to "wake up" on the next request. For checking the World Cup
table a few times a day, this is barely noticeable.

If you'd rather it stayed warm: a free uptime monitor (e.g.
[cron-job.org](https://cron-job.org) or UptimeRobot) pinging
`https://your-app.onrender.com/healthz` every 10 minutes will keep it awake.
`/healthz` never calls football-data.org or API-FOOTBALL, so this costs
**zero** API quota. Render's free plan includes 750 instance-hours/month —
one service running 24/7 uses ~720-744 hours, so this still fits.

## Switching competitions later ("...and beyond")

Everything is driven by environment variables, so when the World Cup ends
you don't need to touch any code:

- **`COMPETITION_CODE`** (football-data.org) — `WC` = World Cup. Other
  competitions on their free plan have historically included `CL`
  (Champions League), `PL`/`PD`/`BL1`/`SA`/`FL1` (Premier League / La Liga /
  Bundesliga / Serie A / Ligue 1), `DED` (Eredivisie), `PPL` (Primeira Liga),
  `ELC` (Championship), `EC` (Euros) and `BSA` (Brasileirão) — double-check
  the current free list on football-data.org's pricing page, as plans can
  change.
- **`API_FOOTBALL_LEAGUE_ID`** + **`API_FOOTBALL_SEASON`** — only used for
  the Discipline tab. Look up the league ID for your competition in
  [API-FOOTBALL's docs](https://www.api-football.com/documentation-v3).

One thing to note: the **Table** tab is built for *group* standings. For a
single-table league (e.g. Premier League) it'll still render correctly as
one group — but for a pure-knockout competition there may be nothing to
show there. The **Matches**, **Scorers** and **Discipline** tabs work for
any competition.

## Customizing

- **Colors/theme** — every color is a CSS variable at the top of
  `public/css/styles.css` (`:root` for dark, `[data-theme='light']` for
  light). Change one value and everything using it updates.
- **Polling speed** — the constants near the top of `public/js/app.js`
  (`MATCHES_LIVE_INTERVAL`, `BASE_INTERVAL`, `DATA_SAVER_MULTIPLIER`...) and
  the matching `TTL` values in `server/routes/api.js`.
- **After editing CSS/JS** — bump `CACHE_NAME` in `public/sw.js` (`v1` →
  `v2`) so returning visitors get the new version. See the comment at the
  top of that file for why this is necessary.

## Troubleshooting

- **"Add your football-data.org key" on every tab** — `.env` is missing
  `FOOTBALL_DATA_TOKEN`, or the server wasn't restarted after you edited
  `.env`.
- **Discipline tab says it's optional** — expected if you haven't added
  `API_FOOTBALL_KEY`. Everything else still works.
- **"Couldn't load this" / upstream error** — usually transient; tap
  Refresh. If it persists, double-check the token is correct.
- **First load after a while is slow** — that's Render's free-tier cold
  start (see above), not your app.
- **CSS/JS edits aren't showing up after redeploying** — bump the service
  worker's `CACHE_NAME` (see Customizing above).

## Cost summary

| Piece                     | Cost                                  |
| ------------------------- | -------------------------------------- |
| football-data.org          | $0 — World Cup is free forever          |
| API-FOOTBALL (optional)     | $0 — 100 requests/day free tier         |
| Render hosting              | $0 — free web service                   |
| GitHub                       | $0                                       |
| **Total**                     | **$0/month**                              |

## License

MIT — do whatever you like with it.
