# Matchday — Live World Cup 2026 Tracker (and beyond)

A small, fast, **$0-to-run** web app for following the World Cup: a live group
table, fixtures/results with kickoff times shown in *your* timezone, a
goals & assists leaderboard, a yellow/red card leaderboard, a knockout
bracket, your own score-prediction game, and push notifications for your
favorite teams all pulled from real, trusted data sources, and designed
from the ground up to be gentle on mobile data.

No build step, no framework, no database (beyond one small, free key-value
store for push subscriptions, fully optional). A tiny Node/Express server
caches and trims responses from
[football-data.org](https://www.football-data.org) (and optionally
[API-FOOTBALL](https://www.api-football.com)), and a plain HTML/CSS/JS
frontend renders them into a mobile-first, installable app.

## Features

- **Live scores & fixtures** — grouped into Live now / Today / Upcoming /
  Results, with every kickoff time shown in your device's local timezone
- **Group table** for all 12 groups, with qualification zones highlighted
- **Knockout bracket** — Round of 32 through the Final, built automatically
  from the fixture list as soon as those matches are scheduled
- **Goals & assists** leaderboard
- **Yellow/red card** leaderboard (optional — needs one extra free key)
- **Favorite teams** — star any team anywhere it appears; powers a "My
  Teams" filter on the Matches tab and targets push notifications
- **Add to calendar** — one tap on an upcoming fixture downloads a standard
  `.ics` file, no account or server round-trip needed
- **Share a match as an image** — turns any match card into a themed PNG via
  the device's native share sheet (or a direct download on desktop)
- **Score predictions** — call your own scoreline for any match; scored
  automatically against real results (3 pts exact score, 1 pt correct
  result). Entirely on your device no accounts, no leaderboard
- **Push notifications** *(optional)* — kickoff reminders and goal alerts
  for your favorite teams, even when the app's closed. Needs two small,
  free pieces of setup *see [Push notifications](#push-notifications-optional) below
- **Offline-friendly** — the last data you saw stays available (with a
  clear "offline" banner) if your connection drops
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
       ^                          |                       optional)
       |                          v
       +---- push notification ---+----> a free Upstash Redis database
            (optional — only          (remembers who's subscribed, and
             if you set it up)         to which favorite teams)
```

Why a server in between, instead of calling the APIs straight from the
browser?

- Your API keys stay server-side, never shipped to the browser.
- One server-side cache serves every visitor/tab/device, so no matter how
  often the UI polls, the upstream APIs get called far less comfortably
  inside both free tiers.
- The server strips each response down to only the fields the UI uses,
  often cutting payload size by more than half before it ever reaches your
  phone.

### Caching strategy

| Endpoint          | Cache TTL                              | Why                                                    |
| ----------------- | --------------------------------------- | ------------------------------------------------------ |
| `/api/matches`     | 45s while any match is live, 5 min otherwise | the one thing that genuinely needs to feel "live" |
| `/api/standings`   | 5 min                                   | the table only changes when a match ends                |
| `/api/scorers`     | 10 min                                  | goal/assist leaders change slowly                       |
| `/api/cards`       | 3 hours                                 | API-FOOTBALL's free tier is 100 req/day — this alone uses ~16/day |

### Low-data techniques used throughout

- Flags are rendered as **emoji**, not images: zero network requests, crisp
  at any size, themeable for free.
- **System fonts only** (`system-ui`, `ui-monospace`): no font files to
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
  interval and turns itself on automatically if your browser reports
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
  **Discipline** (cards) tab football-data.org's plan doesn't include card
  rankings. Everything else works fine without this.

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and paste in your `FOOTBALL_DATA_TOKEN` (and `API_FOOTBALL_KEY`
if you got one leave it blank to skip the Discipline tab).

### 3. Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>.

`npm run dev` restarts automatically on file changes (uses Node's built-in
`--watch`, no extra dependency).

Favorites, calendar export, sharing, the bracket and the prediction game all
work immediately with no extra setup they're either pure client-side
features or just different views of data you're already fetching.

## Push notifications (optional)

Get a notification when a team you've starred is about to kick off, scores,
or finishes a match even if you don't have the app open. This is the one
feature that needs two small pieces of free setup. Skip this section
entirely if you don't want it: the rest of the app works exactly the same
either way, and the notification bell in the header just stays hidden.

### Why two pieces of setup?

1. **VAPID keys** — these identify *your* server to the browser's push
   service (Chrome's, Firefox's, etc.), so it knows the notification really
   came from you. You generate these yourself, no account needed.
2. **A free Upstash Redis database** — something has to remember who's
   subscribed and to which teams, in a way that survives Render's free tier
   restarting/sleeping (in-memory storage alone would forget every
   subscriber the moment the service spins down).

### Step 1 — generate VAPID keys

```bash
npm install        # if you haven't already
npm run vapid:generate
```

This prints a `Public Key` and a `Private Key`. Paste them into `.env`:

```makefile
VAPID_PUBLIC_KEY=<the public key>
VAPID_PRIVATE_KEY=<the private key>
VAPID_SUBJECT=mailto:you@example.com
```

`VAPID_SUBJECT` can be any contact URI — it's never shown to people using
your app, it just gives push services a way to reach you if your server
ever misbehaves (e.g. sends too many notifications).

### Step 2 — create a free Upstash Redis database

1. Go to [console.upstash.com](https://console.upstash.com) and sign up
   (GitHub, Google, or email **no credit card required**).
2. **Create Database** → pick the **free tier** (500K commands/month, 256MB far more than a personal app needs) → choose any region close to where
   your Render service will run.
3. Open the database, find the **REST API** panel, and copy the two values
   into `.env`:

```makefile
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Restart the server (`npm start`). You should see:

```bash
🔔 Push notifications enabled kickoff reminders + goal alerts for favorited teams.
```

The notification bell (🔕) now appears in the header. Star a team first
(Matches or Table tab), then tap the bell to subscribe.

### The one important catch — Render's free tier sleeping

Push notifications are detected by a background loop on the *server*
it has to actually be running to notice a kickoff or a goal. Render's free
tier sleeps after 15 minutes with no HTTP traffic, which pauses that loop
along with everything else. If nobody's visited the site recently, a goal
can happen and nothing will fire until the next request wakes the service
back up.

This is exactly why the `/healthz` keep-alive trick in
[Deploying](#about-renders-free-tier) below stops being a nice-to-have and
becomes load-bearing once you turn push notifications on: a free uptime
pinger hitting `/healthz` every 5-10 minutes keeps the server (and the
watcher loop) awake continuously, well within Render's 750 free
instance-hours/month.

### A note on scope

Notifications are scoped to your **favorited teams only** (not every
match) to avoid spamming you, and cover three moments: kickoff (~15 minutes
before), a goal, and full time. The subscribe/unsubscribe endpoints have no
authentication fine for a personal app you're the only one using, not
something you'd want to expose as a public multi-tenant service without
adding some.

## Project structure

```makefile
matchday-tracker/
├── server/
│   ├── index.js              # Express app: static files, gzip, /healthz, push boot
│   ├── cache.js               # tiny in-memory TTL cache
│   ├── routes/
│   │   ├── api.js             # /api/standings, /matches, /scorers, /cards, /meta
│   │   └── push.js            # /api/push/* — subscribe, unsubscribe, favorites sync
│   ├── providers/
│   │   ├── footballData.js    # football-data.org client
│   │   └── apiFootball.js     # API-FOOTBALL client (cards only)
│   └── lib/
│       ├── transform.js       # shrinks + humanises upstream responses
│       ├── matches.js         # shared cached-matches fetcher (route + watcher use this)
│       ├── store.js           # Upstash Redis — push subscriptions, dedupe markers
│       ├── push.js            # Web Push (VAPID) sender
│       └── watcher.js         # background loop: kickoff/goal/full-time detection
├── public/
│   ├── index.html
│   ├── manifest.json           # "Add to Home Screen" support
│   ├── icon.svg
│   ├── sw.js                   # app-shell cache + push notification display
│   ├── css/styles.css          # all styling, theming via CSS variables
│   └── js/
│       ├── app.js              # all frontend rendering/state logic (no framework)
│       ├── flags.js            # country name -> emoji flag lookup
│       ├── favorites.js        # localStorage favorite teams
│       ├── calendar.js         # .ics file generation
│       ├── share.js            # canvas match-card image + Web Share API
│       ├── bracket.js          # knockout bracket data transform (pure function)
│       ├── predictions.js      # localStorage prediction game + scoring
│       └── push.js             # client-side push subscription management
├── .env.example
├── render.yaml                 # optional Render Blueprint
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
   `COMPETITION_CODE`, etc. if you're using them). If you've set up push
   notifications, add those five too: `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`.
5. Create Web Service. Render builds and deploys, giving you a
   `https://your-app.onrender.com` URL.

**Option B — Blueprint**

This repo includes `render.yaml`. In Render, choose **New** → **Blueprint**
and point it at your repo. Render reads the file and creates the service
for you. You'll still be prompted to paste in `FOOTBALL_DATA_TOKEN` /
`API_FOOTBALL_KEY` (and the five push notification variables, if you're
using them) directly in the dashboard they're all marked `sync: false`
so none of them are ever stored in the repo.

### About Render's free tier

Free web services spin down after 15 minutes with no traffic and take
30-60 seconds to "wake up" on the next request. For checking the World Cup
table a few times a day, this is barely noticeable.

If you'd rather it stayed warm: a free uptime monitor (e.g.
[cron-job.org](https://cron-job.org) or UptimeRobot) pinging
`https://your-app.onrender.com/healthz` every 10 minutes will keep it awake.
`/healthz` never calls football-data.org or API-FOOTBALL, so this costs
**zero** API quota. Render's free plan includes 750 instance-hours/month
one service running 24/7 uses ~720-744 hours, so this still fits.

**If you've enabled push notifications, this stops being optional.** The
watcher that detects kickoffs and goals only runs while the server is
awake without a keep-alive pinger, notifications will mostly just not
arrive while nobody's actively using the site. See
[Push notifications](#push-notifications-optional) above for the full
explanation.

## Switching competitions later ("...and beyond")

Everything is driven by environment variables, so when the World Cup ends
you don't need to touch any code:

- **`COMPETITION_CODE`** (football-data.org) — `WC` = World Cup. Other
  competitions on their free plan have historically included `CL`
  (Champions League), `PL`/`PD`/`BL1`/`SA`/`FL1` (Premier League / La Liga /
  Bundesliga / Serie A / Ligue 1), `DED` (Eredivisie), `PPL` (Primeira Liga),
  `ELC` (Championship), `EC` (Euros) and `BSA` (Brasileirão) double-check
  the current free list on football-data.org's pricing page, as plans can
  change.
- **`API_FOOTBALL_LEAGUE_ID`** + **`API_FOOTBALL_SEASON`** only used for
  the Discipline tab. Look up the league ID for your competition in
  [API-FOOTBALL's docs](https://www.api-football.com/documentation-v3).

One thing to note: the **Table** tab is built for *group* standings. For a
single-table league (e.g. Premier League) it'll still render correctly as
one group but for a pure-knockout competition there may be nothing to
show there. The **Matches**, **Scorers** and **Discipline** tabs work for
any competition.

## Customizing

- **Colors/theme** — every color is a CSS variable at the top of
  `public/css/styles.css` (`:root` for dark, `[data-theme='light']` for
  light). Change one value and everything using it updates.
- **Polling speed** — the constants near the top of `public/js/app.js`
  (`MATCHES_LIVE_INTERVAL`, `BASE_INTERVAL`, `DATA_SAVER_MULTIPLIER`...) and
  the matching `TTL` values in `server/routes/api.js`.
- **After editing CSS/JS** — bump `CACHE_NAME` in `public/sw.js` (currently
  `v2` → next would be `v3`) so returning visitors get the new version. See
  the comment at the top of that file for why this is necessary.

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
- **Notification bell never appears** — needs `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` *and* `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` all set, and the server restarted afterward.
  Check the boot log it tells you explicitly whether push is enabled.
- **Subscribed, but notifications aren't arriving** — almost always
  Render's free tier asleep when the event happened; see
  [the keep-alive note](#about-renders-free-tier). Also double-check you've
  actually starred a team notifications only fire for favorited teams.
- **iOS notifications don't work at all** — Safari only supports web push
  for sites added to the home screen ("Add to Home Screen"), on iOS 16.4+.
  Regular Safari tabs can't receive push notifications this is an Apple
  platform limitation, not something this app can work around.

## Cost summary

| Piece                     | Cost                                  |
| ------------------------- | -------------------------------------- |
| football-data.org          | $0 — World Cup is free forever          |
| API-FOOTBALL (optional)     | $0 — 100 requests/day free tier         |
| Upstash Redis (optional, push only) | $0 — 500K commands/month free tier, no card |
| Render hosting              | $0 — free web service                   |
| GitHub                       | $0                                       |
| **Total**                     | **$0/month**                              |

## License

MIT — Feel free to contribute to the this repo if you find this interesting and would love to take it one step further.
