# Sweepstakes News

World Cup 2026 sweepstakes web app for predicting every match score before the first kick-off.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Data model

- Fixtures are seeded from `openfootball/worldcup.json` in `src/data/fixtures.ts`.
- The app follows the 2026 format: 12 groups of four, top two plus the eight best third-placed teams into the Round of 32.
- Knockout placeholders are resolved from each player's predicted group tables, then winners advance through the tree.
- The old spreadsheet scoring model is adapted in `src/lib/tournament.ts`.
- Format references: FIFA's 2026 format FAQ and the FIFA World Cup 26 regulations, Articles 12 and 13.

## Deployment persistence

Without a database, the app works as a local browser demo only. Players on different devices will not see each other because Vercel serverless functions do not provide shared persistent storage.

For the real game, create a Supabase project and run `supabase-schema.sql`, then set:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
ADMIN_RESULTS_KEY=
WC2026_API_KEY=
RESULTS_CACHE_SECONDS=120
PLAYER_STATS_DAILY_CALL_BUDGET=120
```

## Results syncing

The cron route is configured in `vercel.json` as a daily safety refresh:

```text
/api/cron/update-results
```

Vercel Hobby only supports daily cron jobs. The leaderboard uses `/api/results/live`
to refresh on demand and cache provider calls in Supabase, so it can still feel live
without frequent cron. On Vercel Pro, you can change the cron schedule to a more
frequent cadence such as `*/5 * * * *`.

It supports three provider paths:

- `WC2026_API_KEY`: uses the World Cup 2026 API. Override the URL with `WC2026_API_URL` if needed.
- `RESULTS_API_URL`: any JSON endpoint returning `{ "matches": [{ "fixtureId": 1, "home": 2, "away": 0, "team1": "Mexico", "team2": "South Africa", "winner": "Mexico" }] }`

The app keeps stable internal `fixtureId` values for saved picks, but the UI shows chronological match numbers. Provider rows are mapped by normalized team names first. Numeric identifiers are only used as fallbacks when they agree with any supplied teams, preventing an official match number from being mistaken for the app's chronological display number.
- `API_FOOTBALL_KEY`: uses API-Football-style fixture payloads. Override the URL with `API_FOOTBALL_URL` if their World Cup league/season endpoint changes.

Local test paths:

```bash
curl "http://localhost:3000/api/cron/update-results?sample=1"
curl "http://localhost:3000/api/results/live?refresh=1"
curl "http://localhost:3000/api/results/live?test=1"
curl "http://localhost:3000/api/sandbox/match"
```

The sample path seeds deterministic local results. The live path calls the
configured results provider (`RESULTS_API_URL`, `WC2026_API_KEY`, or
`API_FOOTBALL_KEY`) and stores the normalized response.

The `test=1` live path and `/api/sandbox/match` use the WC2026 API sandbox
match when `WC2026_API_KEY` is configured. They are read-only test paths and do
not write sandbox scores to Supabase.

Provider calls are deliberately throttled for the WC2026 free tier:

- The app will not call the real results provider before the first kick-off.
- It only refreshes near match days during the tournament.
- Provider checks are cached in Supabase for at least 2 minutes during live match
  windows and at least 60 minutes outside them, even if the
  provider returns no completed matches or a rate-limit warning.
- `RESULTS_CACHE_SECONDS` can be set higher, but values below 120 seconds are
  clamped to 120 during live match windows to protect the API key.

## Goals and assists syncing

`/goals-assists` shows cached leading scorers and assists. Page views never call
the provider. The nightly cron refreshes match results once, then refreshes
cached player goal events. When `FIRECRAWL_API_KEY` is configured, player stats
come from FIFA's official player statistics page via Firecrawl because that
table includes both goals and assists. If FIFA/Firecrawl is not configured or
fails, the app tries API-Football fixture events, then falls back to WC2026
`/matches/:id/stats` for completed/live matches whose player stats are missing
or stale; that final fallback currently includes scorers but not assists.

```text
/api/cron/update-goals-assists
```

The default player-stat cap is 120 calls/day. A FIFA/Firecrawl refresh costs 1
tracked player-stat call. API-Football is kept as an event-data fallback, but
its free plan may not include World Cup 2026 data or batched fixture lookups.
