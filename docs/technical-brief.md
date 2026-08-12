# FPL Mini-League Leaderboard — Technical Brief

**Prepared for:** development handover
**Date:** 11 August 2026
**Target season:** Premier League 2026/27 (starts 22 August 2026, ends 30 May 2027, 38 gameweeks)

---

## 1. What we're building

A leaderboard system for a private Fantasy Premier League mini-league among friends. Alongside the standard season-long table that FPL already provides, we want:

- **Weekly table** — per-gameweek scores and a declared weekly winner
- **Monthly table** — gameweeks grouped into calendar months, with a monthly winner
- **Season table** — cumulative, mirroring official FPL standings
- **Winner history** — a running record of who has won each week and each month

The value over the official FPL site is the weekly and monthly competitions, which FPL does not offer for mini-leagues. This is a small private group, so scale is not a concern.

### Out of scope for v1

- Player-level analysis, transfer suggestions, differentials
- Money/prize handling or payments
- Multiple leagues (design for one, but don't hardcode the league ID)
- User accounts or authentication

---

## 2. Data source

The Fantasy Premier League public JSON API.

- **Base URL:** `https://fantasy.premierleague.com/api/`
- **Cost:** free
- **Auth:** none required for any endpoint we need
- **Status:** undocumented but public and long-stable. It's what most third-party FPL sites are built on. Treat it as a dependency that could change without notice, not as a contracted API.
- **Terms:** unofficial. Fine for private, non-commercial use. The project is being open-sourced as **self-hosted software** (section 11) — each user runs their own instance against their own league, so we never operate a shared service on top of the API. If anyone monetises a hosted version, that is their call to revisit.

### Getting the league ID

Log into FPL, open the mini-league, and read the ID from the URL:
`https://fantasy.premierleague.com/leagues/{LEAGUE_ID}/standings/c`

Store this in config, not in code.

---

## 3. Endpoints

All paths are relative to the base URL above. All return JSON.

### `bootstrap-static/`

Global reference data. Fetch once per day at most — it's a large payload.

Contains an `events` array (the 38 gameweeks), which is what we care about most:

| Field | Purpose |
|---|---|
| `id` | Gameweek number, 1–38 |
| `name` | e.g. "Gameweek 1" |
| `deadline_time` | ISO timestamp — **use this to assign a gameweek to a calendar month** |
| `finished` | All matches played |
| `data_checked` | Bonus points applied and stats finalised — **this is the flag to gate on, not `finished`** |
| `is_current` / `is_next` | Convenience flags for the live gameweek |
| `average_entry_score` | Useful for context in the weekly post |

Also contains `elements` (players) and `teams` — not needed for v1, but available if we later want to show captain picks.

### `leagues-classic/{LEAGUE_ID}/standings/`

The mini-league table. One call gives us the full roster of managers.

Response shape:

```
{
  "league": { "id": ..., "name": ..., "created": ... },
  "standings": {
    "has_next": false,
    "page": 1,
    "results": [
      {
        "entry": 123456,          // manager ID — the key we join on
        "entry_name": "Team Name",
        "player_name": "Real Name",
        "rank": 1,
        "last_rank": 2,
        "event_total": 67,        // this gameweek's points
        "total": 412              // season total
      }
    ]
  }
}
```

Pagination via `?page_standings=2` when `has_next` is true. Our league is small enough that page 1 will cover it, but handle the flag anyway so it doesn't break if the league grows.

**Primary use:** discovering the member list and their manager IDs. Poll this at the start of each gameweek to pick up anyone who joins mid-season.

### `entry/{MANAGER_ID}/history/`

Per-manager, gameweek-by-gameweek history. **This is the source of truth for weekly and monthly scoring.**

```
{
  "current": [
    {
      "event": 1,
      "points": 72,                // GROSS — before transfer hits
      "total_points": 72,
      "rank": 245123,
      "overall_rank": 245123,
      "event_transfers": 0,
      "event_transfers_cost": 0,   // hits taken, as a positive number
      "points_on_bench": 9,
      "value": 1000,
      "bank": 0
    }
  ],
  "past": [ ... ],   // previous seasons
  "chips": [ { "name": "bboost", "event": 5 } ]
}
```

One call per manager per refresh. With a typical friends league of 10–20 people, that's trivial.

### `entry/{MANAGER_ID}/`

Basic manager info — name, team name, region, leagues joined. Only needed if we want display data not present in the standings response.

### `fixtures/`

All fixtures for the season. Supports `?event=7` to filter by gameweek. Not required for v1, but useful if we later want to show whether a gameweek is still in progress.

---

## 4. Scoring rules

These need to be agreed before build, because they cause arguments afterwards.

### Weekly score

```
net_points = points - event_transfers_cost
```

**Use net points.** A manager who scores 80 with a -8 hit finishes below a manager who scores 74 clean. Gross points is the wrong measure and will be disputed.

⚠️ **Verification task:** the `event_total` field in the classic standings response is believed to be net of hits, but this has not been confirmed against the current season. Cross-check one manager's `event_total` against `points - event_transfers_cost` from their history during the first gameweek, and use whichever is confirmed correct. Don't mix the two sources.

### Monthly grouping

Assign each gameweek to a month by the **month of its `deadline_time`**, not by when matches were played. This is deterministic and easy to explain to the group.

Consequences to be aware of and to document for the players:

- Months will contain unequal numbers of gameweeks (some 3, some 5+)
- August 2026 is short — the season starts on the 22nd, so August likely contains only one or two gameweeks
- Midweek rounds cluster; a month may be front- or back-loaded

Monthly score = sum of net points across all gameweeks assigned to that month.

### Tie-breaks

Agree an order and apply it consistently. Suggested:

1. Highest net points
2. Fewest transfer points deducted
3. Fewest points left on the bench (`points_on_bench`)
4. Better overall rank at that point in the season
5. Declare a shared win

### Chips

Chips (Wildcard, Bench Boost, Triple Captain, Free Hit) are part of normal play — no adjustment. But the `chips` array is worth surfacing in the weekly post, since "he triple-captained Haaland" is the interesting part of the story.

---

## 5. Architecture

```
  Scheduler (cron / serverless timer)
        │
        ▼
  Poller ──────► FPL API  (bootstrap-static, standings, entry history)
        │
        ▼
  Store  (SQLite / Postgres / even flat JSON — small dataset)
        │
        ▼
  Output layer  (see section 6)
```

### Poller logic

1. Fetch `bootstrap-static/`, find the current gameweek.
2. If `data_checked` is **false**, do nothing further and exit. Points are not final.
3. If `data_checked` is **true** and we have not already recorded a result for this gameweek:
   - Fetch league standings → current member list
   - Fetch `entry/{id}/history/` for each member
   - Compute net points, rank, weekly winner
   - Recompute the month-to-date table
   - If this was the final gameweek of a calendar month, also declare the monthly winner
   - Persist results, mark gameweek as processed
   - Trigger the output layer

Suggested schedule: hourly during the season. Cheap, and catches bonus settlement without a long delay.

### Suggested schema

```
managers        (entry_id PK, entry_name, player_name, joined_gw, active)
gw_scores       (entry_id, event, gross_points, transfer_cost, net_points,
                 points_on_bench, chip_used, PRIMARY KEY (entry_id, event))
gameweeks       (event PK, deadline_time, month_key, data_checked, processed_at)
weekly_winners  (event PK, entry_id, net_points, tied_with)
monthly_winners (month_key PK, entry_id, total_net_points, tied_with)
```

Storing raw per-gameweek rows rather than only computed tables means any scoring rule can be recalculated retroactively without refetching. Worth it.

---

## 5b. Recommended stack (decided)

One deployable, one language, no infrastructure to babysit. Both output channels hang off the same core.

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 22) | One language across poller, API and UI; typed FPL response shapes catch API drift at the boundary |
| App + hosting | Next.js (App Router) on Vercel | Server components fetch from the DB directly, so the CORS problem never arises; free tier covers this comfortably |
| Scheduler | Vercel Cron → `/api/poll` route | Hourly during the season. No separate worker to keep alive |
| Database | Postgres on Neon (serverless) | Free tier, branching for testing backfills, survives a redeploy. SQLite would need a persistent disk that serverless doesn't give you |
| ORM / migrations | Drizzle | Thin, SQL-shaped, no runtime magic — easy to hand-audit the scoring queries |
| Styling | Tailwind CSS + CSS variables for the theme | Design ships as utility classes; light/dark handled by swapping variables on the root |
| Fonts | Bebas Neue (display), Manrope (UI), JetBrains Mono (figures) — via `next/font/google` | Self-hosted at build, no layout shift |
| Validation | Zod schemas on every FPL response | Directly implements gotcha 8: fail loudly on missing fields instead of defaulting to zero |
| WhatsApp | Meta WhatsApp Cloud API, webhook as a Next route handler | Official API only. Same repo, same deploy |
| Tests | Vitest on the scoring module | Net points, month mapping and tie-breaks are the parts that must not be wrong |
| Secrets | Vercel env vars (`LEAGUE_ID`, DB URL, WhatsApp token) | League ID stays out of code, per section 2 |

### Repo shape

```
/app          route handlers + pages (weekly, monthly, season, history)
/lib/fpl      typed API client: bootstrap, standings, entry history + Zod schemas
/lib/scoring  net points, month mapping, tie-breaks — pure functions, unit tested
/lib/db       Drizzle schema (section 5) + queries
/app/api/poll cron target: gated on data_checked, idempotent
/app/api/whatsapp  webhook verify + inbound commands
```

Keep `/lib/scoring` free of I/O. Every rule in section 4 should be testable with a fixture array and no network.

### Alternatives considered

- **Static site + GitHub Actions cron** — cheapest possible, but no on-demand refresh and awkward once the WhatsApp webhook needs a live endpoint.
- **Supabase + edge functions** — fine, but adds a second dashboard for no gain at this size.
- **Anything with a long-running container** — over-provisioned for twelve people and one hourly job.

### Two build notes for the developer

1. Requests from datacentre IPs are sometimes blocked by the FPL CDN (gotcha 3). Test the poller from a deployed preview, not just locally, in phase 1.
2. The web page reads only from our own Postgres. It never calls the FPL API at request time — that keeps the page fast and sidesteps CORS and rate limits entirely.

---

## 6. Output layer — decision required

The core system is delivery-agnostic. Two realistic options:

**Option A — WhatsApp bot.** Posts the table into the existing group chat after each gameweek settles. Best fit for the social side of it, since nobody has to visit anything. Requires the official WhatsApp Cloud API: a Meta Business account, business verification, a dedicated phone number, and a public webhook endpoint. Free API access; you pay per conversation for template-initiated messages. **Do not use unofficial libraries (Baileys, green-api and similar) — they get the number banned.** Note the 24-hour messaging window: proactive posts outside a user-initiated window require pre-approved templates.

**Option B — Web page.** A simple static or server-rendered page with weekly/monthly/season tabs. Much less setup, no approval process, no per-message cost. Loses the "it just appears in the chat" quality. Note that the FPL API sends no CORS headers, so the page cannot call it directly from browser JavaScript — all fetching must happen server-side or in a build step.

**Decision: build both, web first.** The web page (Option B) ships with phase 4 and is the canonical, always-correct view — see section 10 for the approved design. The WhatsApp bot (Option A) follows as a thin publisher that renders the same stored results as a text post when a gameweek settles, gated behind the same `data_checked` check and the same idempotency guard. Building the poller and store first, and getting the scoring right, remains the priority.

---

## 7. Known gotchas

1. **No CORS headers on the FPL API.** Browser JavaScript cannot call it directly. Everything goes through a backend or serverless function. This catches out most people on day one.
2. **Points are not final at full-time.** Bonus points settle an hour or more after the last match of a round, and retrospective stat corrections (an assist reassigned, a goal re-credited) do occasionally land days later. Gate all winner declarations on `data_checked`.
3. **Rate limiting.** No published limit, but they will throttle aggressive clients. Cache everything, set a descriptive `User-Agent` header, and back off on 429s and 403s. Requests from datacentre IPs are sometimes blocked by their CDN — worth testing from the actual deployment environment early rather than only from a laptop.
4. **Transfer hits.** As above — `points` is gross. This is the single most common bug in homemade FPL leaderboards.
5. **Mid-season joiners.** Someone who joins the mini-league at gameweek 10 will have history for gameweeks 1–9 in the API. Decide whether their earlier scores count toward monthly tables. Recommendation: only count gameweeks from the point they joined the league, and store `joined_gw` to make this explicit.
6. **Idempotency.** The poller will run many times per gameweek. Processing must be safe to repeat — never double-post to the group, never double-write a winner.
7. **Season rollover.** The `history` endpoint's `current` array resets each season. Archive before the new season starts.
8. **API drift.** Field names have changed between seasons in the past. Fail loudly on missing fields rather than silently defaulting to zero — a silent zero would corrupt a monthly table.

---

## 8. Suggested build order

| Phase | Deliverable |
|---|---|
| 1 | Fetch and store league members and one gameweek of history; verify net-points calculation against the FPL site by hand |
| 2 | Full poller with `data_checked` gating, idempotent writes, gameweek-to-month mapping |
| 3 | Weekly and monthly winner logic including tie-breaks |
| 4 | Output layer (per section 6 decision) |
| 5 | Backfill and archive handling for season rollover |

Phase 1 should be manually verified against the live site before anything is announced to the group. One wrong weekly winner destroys trust in the whole thing.

---

## 9. Open questions for the client

- ~~WhatsApp bot or web page for output?~~ — answered: both, web first (section 6)
- Tie-break order — confirm or amend the suggestion in section 4
- Do mid-season joiners' pre-join gameweeks count?
- Are there prizes attached to weekly/monthly wins? If so, accuracy requirements go up and an audit trail of raw scores becomes essential
- Should the weekly post include colour — captain picks, chips played, points left on bench — or just the table?

---

## 10. Web design reference

The approved design is `FPL League.dc.html` in this bundle — an interactive HTML prototype of the full page. Open it in a browser; the tabs, gameweek and month pickers and the dark-mode toggle all work. Data in it is mocked at GW12 of 2026/27.

### Structure

Single page, max content width 1060px, 32px side padding.

1. **Header** — season eyebrow, league name in display type, settlement status pill (green dot + `GW 12 SETTLED`), dark-mode toggle, next-deadline line.
2. **Hero strip** — three equal cells divided by 1px rules: gameweek winner, month leader, season leader. Each is label / name / points + context.
3. **Tabs** — Weekly, Monthly, Season, History. Active tab: full-strength ink with a 2px accent underline.
4. **Pickers** — GW1–GW12 pills on Weekly, month pills on Monthly. Selected pill is filled with the accent.
5. **Table** — grid `44px minmax(0,1fr) 96px 96px 104px`: rank, manager (real name over team name, plus chip badge), then three numeric columns that change per tab (Net/Hits/Bench, Net/GWs/Avg, Total/Hits/Best GW). Leader marked with a small accent dot. Row hover tints the background.
6. **Footnote** — states the scoring rule in force for that tab. This is deliberate: it heads off arguments.
7. **History tab** — two columns, weekly winners and monthly winners, newest first.
8. **Footer** — last poll time and a note that the table also posts to WhatsApp.

### Design tokens

Set as CSS variables on the root; dark mode swaps the same names.

| Token | Light | Dark |
|---|---|---|
| `--bg` | oklch(0.975 0.006 300) | oklch(0.19 0.03 300) |
| `--panel` | oklch(0.99 0.004 300) | oklch(0.23 0.035 300) |
| `--ink` | oklch(0.21 0.03 300) | oklch(0.96 0.01 300) |
| `--dim` | oklch(0.55 0.02 300) | oklch(0.68 0.02 300) |
| `--line` | oklch(0.89 0.012 300) | oklch(0.31 0.03 300) |
| `--hair` | oklch(0.93 0.01 300) | oklch(0.27 0.03 300) |
| `--hover` | oklch(0.955 0.01 300) | oklch(0.235 0.035 300) |
| `--accent` | oklch(0.42 0.17 305) | oklch(0.72 0.19 145) |
| `--pop` | oklch(0.72 0.19 145) | oklch(0.78 0.16 100) |

Type: **Bebas Neue** for headings (league name 66px, hero names 38px, section headings 32px — uppercase, line-height ~0.9); **Manrope** 15–16px for names and UI; **JetBrains Mono** for every number, label and eyebrow (10–16px, letter-spacing 0.14–0.16em on uppercase labels).

Radii: 4px on pills and badges, 999px on the status pill and toggle. No shadows anywhere — hairline rules only. Transitions: 120ms on row hover, 200ms on theme change.

### Large leagues

The design carries these only when the league exceeds one page (25 rows); a twelve-person league sees none of them.

- **Search** — filters on manager name and team name, client-side over the already-loaded page set for small leagues, server-side (`ILIKE`, indexed) above ~200 managers. Resets to page 1 on every keystroke.
- **Pager** — 25 rows per page, "1–25 of 240" on the left, Prev / Page n of m / Next on the right. Disabled buttons dim to 45% rather than disappearing, so the control does not reflow.
- **Rank is absolute**, computed over the whole sorted league before slicing — never the page index.
- **No viewer identity.** There are no accounts (section 1) and nothing reliably tells us which manager is looking, so there is no "my row" pinning or jump. Search is how you find yourself.

Server-side: sort and paginate in SQL (`ORDER BY net_points DESC, transfer_cost ASC, points_on_bench ASC LIMIT 25 OFFSET n`). Note this is *display* pagination and is unrelated to the FPL API's `has_next` standings pagination (section 3) — both are needed, for different reasons.

### Behaviour to implement

- Tab, gameweek and month selection are client state; the tables themselves render server-side from Postgres.
- Dark-mode preference persists in `localStorage` (`fpl-dark`); default to the system preference on first visit.
- The status pill is derived, not hardcoded: green when the latest gameweek is `data_checked`, amber with "provisional — bonus not yet applied" when it is finished but unchecked.
- Chip badges (FH / BB / TC / WC) come from the `chips` array on the entry history.
- Below 720px the hero strip stacks and the table drops to two numeric columns (the primary score plus one).

---

## 11. Open-source / self-host requirements

The project ships publicly so other groups can run it for their own mini-league. That changes a few decisions and adds a small amount of work — all of it worth doing in phase 1 rather than retrofitting.

### Configuration, not code

Everything group-specific comes from environment variables. No league ID, phone number, manager name or copy string is hardcoded.

| Variable | Required | Notes |
|---|---|---|
| `FPL_LEAGUE_ID` | yes | From the mini-league URL (section 2) |
| `DATABASE_URL` | yes | Any Postgres |
| `LEAGUE_DISPLAY_NAME` | no | Defaults to the `league.name` returned by the API |
| `SEASON_LABEL` | no | e.g. `2026/27` |
| `TIMEZONE` | no | Defaults to `Europe/London`; drives deadline display and month boundaries |
| `TIEBREAK_ORDER` | no | Comma-separated rule keys (section 4), defaults to the agreed order |
| `COUNT_PREJOIN_GWS` | no | Boolean, default false (gotcha 5) |
| `ACCENT_COLOR` / `POP_COLOR` | no | Theme overrides, mapped straight onto the CSS variables in section 10 |
| `WHATSAPP_*` | no | Absent = WhatsApp publisher disabled, web only |
| `FPL_USER_AGENT` | no | Descriptive UA per gotcha 3; default identifies the project and version |

Rule: **the app must boot and run correctly with only the two required variables set.** Anything else missing degrades a feature, never crashes the poller.

### Repo hygiene

- MIT licence.
- `.env.example` with every variable above, commented. No real values, ever — add a secret scan to CI.
- `README.md`: what it does, a screenshot of both themes, five-minute deploy path (fork → Neon database → Vercel import → set two env vars → done), and a plain-English explanation of the scoring rules so a new group can decide whether they agree with them.
- Seed/fixture data checked in so the app can be run and the tests passed without touching the live API.
- A prominent disclaimer: not affiliated with, endorsed by, or connected to the Premier League or Fantasy Premier League; uses an undocumented public API that may change or stop working; run at your own risk.
- No Premier League or club marks, crests, kit colours or fonts in the repo or the UI. The design in section 10 is deliberately original for this reason.

### Behaviour that has to be safe in other people's hands

1. **Rate limiting is now everyone's problem.** Many self-hosted instances polling hourly is a lot more traffic than one. Cache `bootstrap-static/` for 24 hours, poll at a per-instance random offset within the hour rather than on the hour, and back off hard on 429/403.
2. **Larger leagues.** Ours is twelve people; someone will point this at a 200-manager league. Honour `has_next` pagination (section 3) and batch the per-manager history calls with a small concurrency limit rather than firing them all at once.
3. **Configurable rules.** Tie-break order and the pre-join question are group decisions, not ours — hence the variables above. Whatever is in force must be stated in the UI footnote (section 10, item 6) so nobody has to read the source to know how they lost.
4. **Multi-league is still out of scope** — one instance, one league. Do not hardcode the ID, but do not build a league picker either.
5. **Season rollover** (gotcha 7) matters more publicly: ship the archive step, not a note promising it.

---

## 12. Fixtures and the live provisional view

The FPL API exposes fixtures, so the page covers the mid-week and in-play states, not only settled tables.

### Endpoints

- `/api/fixtures/` — all 380 fixtures; `/api/fixtures/?event=N` for one gameweek.
- Team names and three-letter codes come from the `teams` array in `bootstrap-static/`; join on `team_h` / `team_a` ids.

Fields used: `kickoff_time` (UTC — convert with `TIMEZONE`), `started`, `finished`, `minutes`, `team_h_score` / `team_a_score`, and `stats` (goals, assists, bonus, BPS) for provisional bonus. `team_h_difficulty` / `team_a_difficulty` are available but unused — fixture difficulty is a squad-planning tool, not a league tool, and was deliberately left out.

### Fixtures tab

A fifth tab after History. Header is the gameweek name plus deadline and a live countdown, with a state line on the right ("6 of 10 played"). Below, a five-across grid of fixture cells (two-across on mobile): home code, minute or `FT`, score, away code. Unstarted fixtures show kickoff time in dimmed text instead of a score. In-play minute is amber.

Fixtures are text only — three-letter codes, no crests, kit colours or league marks (section 11).

### Live provisional table

While the current gameweek is started but not `data_checked`:

- The status pill turns **amber** and reads `GW n LIVE · PROVISIONAL`, with a subline stating the last settled gameweek.
- **The in-play gameweek appears in the Weekly rail as soon as it starts, and is the default selection** — styled like any other pill, so the Weekly tab, the Fixtures tab and the header always agree on which gameweek is current.
- Its table meta line reads "In play · n of 10 fixtures started · provisional" in amber.
- That table replaces the Bench column with **Prov bonus** — bonus derived from live BPS in `stats`, shown as `+n`.
- The footnote states plainly that nothing is final and no winner is recorded yet.

Non-negotiable: **a live gameweek never writes a winner.** It is a read-only projection. Only the `data_checked` transition writes the settled row, records the weekly winner, updates the month, and triggers the WhatsApp post (sections 4 and 6). The live view exists so people can watch; the settled write is what counts.

### Polling

The hourly cron is too slow for a live view. During a gameweek's fixture window, poll `/api/fixtures/?event=N` and live points every 2–5 minutes; outside it, fall back to hourly. Derive the window from `kickoff_time` of the first and last fixture plus a margin — do not poll fast for a whole weekend. This makes the rate-limit etiquette in section 11 more important, not less: cache aggressively, back off on 429, and never let a self-hosted instance poll fast when no ball is being kicked.

---

## 13. Preseason and empty state

Before Gameweek 1 there is nothing to rank, so the page shows a different thing rather than an empty table.

The hero strip and the gameweek pills are not rendered. The status pill reads `PRESEASON` with a neutral dot. In place of the tables:

- Eyebrow "Nothing to show yet", a headline giving the season start date, and a live countdown to the Gameweek 1 deadline.
- A short line stating the tables populate themselves once Gameweek 1 settles.
- A **Managers in** table: rank number, manager name, team name, and join date with time. Sorted oldest join first. Carries the same search box and 25-row pager as the league tables, on the same breakpoints.

### Join timestamps

The classic-league standings response includes a `new_entries` block whose results carry `joined_time` alongside `entry`, `entry_name` and the player name. That timestamp is only present while an entry is still classed as new, so the poller must capture it on first sight and persist it to the `joined` column; it cannot be recovered later. For entries already present before this tool was pointed at the league, leave `joined` null and display a dash rather than guessing.

The Fixtures tab still works in preseason, showing Gameweek 1 fixtures with kickoff times and no scores.
