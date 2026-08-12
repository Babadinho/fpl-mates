# Internals

How each part of the app works, for people changing it. For what the project is
and how to deploy it, see the README; for what is still unbuilt, see
[ROADMAP.md](ROADMAP.md); for the original specification, see
[technical-brief.md](technical-brief.md).

---

## Shape of the thing

```
FPL API ──► lib/fpl/client ──► lib/sync ────────► Postgres ──► lib/view ──► app/page
             (typed, Zod)      lib/poll                        (read only)
                                  │
                                  └── lib/scoring (pure, no I/O)
```

Two rules hold the design together:

**The browser never talks to the FPL API.** It sends no CORS headers, so it
cannot be called from client JavaScript (gotcha 1). Everything is fetched
server-side and stored; pages read only from Postgres. This also keeps the page
fast and immune to the API being slow or down.

**Scoring is pure.** `lib/scoring/*` performs no I/O. Every rule is testable
with a fixture array and no network, which is why the parts that must not be
wrong have the most tests.

---

## Configuration — `lib/config.ts`

Reads `process.env` **here and nowhere else**. Everything else imports
`getConfig()`. That is what makes the project self-hostable rather than
personal: nothing group-specific is compiled in.

Three invariants:

1. The app boots with only `FPL_LEAGUE_ID` and `DATABASE_URL` set.
2. Every other variable has a working default. A missing optional variable
   degrades a feature; it never crashes the poller.
3. Invalid values fail loudly at boot, naming the variable, rather than
   defaulting to something silently wrong.

Parsed once per process and frozen (`cached ??= load()`).

### Reporting failures

Validation failures must go through `ctx.addIssue`, **not** `throw`. An
exception raised inside a Zod `.transform()` escapes `safeParse` entirely, so
the caller gets a raw stack trace that never names the offending variable. This
was a real bug; see `boolEnv` for the correct pattern.

### Colours

`ACCENT_COLOR` and friends are interpolated into `style` attributes, so the
charset is restricted — a self-hoster can only attack themselves, but there is
no reason to let `;` or `<` escape the declaration. Any CSS colour form works:
`red`, `#ff8800`, `rgb(...)`, `oklch(...)`.

There is **no contrast guard**. `--accent-ink` is a fixed near-white on the
accent background, so a very light accent gives unreadable text. See the roadmap.

---

## FPL client — `lib/fpl/`

### `schemas.ts`

Zod schemas for every response consumed. Field names have changed between
seasons before, and a silently-defaulted zero would corrupt a monthly table, so
every field actually used is **required** here — drift fails at the boundary
rather than halfway through a scoring query (gotcha 8). Unknown extra fields are
stripped; the API adds keys often and that is never our problem.

The field worth knowing: **`points` is GROSS**, before transfer hits.
`event_transfers_cost` is the deduction, as a positive number.

### `client.ts`

Politeness is built in rather than optional, because once self-hosted many
instances share one upstream:

- Descriptive `User-Agent` (gotcha 3).
- Retry with exponential backoff on 429/403/5xx, honouring `Retry-After`.
  **403 is treated as retryable on purpose** — the FPL CDN returns it when it
  dislikes the caller's IP, which on a serverless host is intermittent rather
  than permanent.
- `mapWithConcurrency` caps parallel requests so a 200-manager league does not
  fire 200 simultaneous calls.

### Roster discovery — the non-obvious part

`fetchLeagueRoster` reads **both** `standings.results` and
`new_entries.results`. This is not defensive coding:

> Before GW1 settles, `standings.results` is **empty** and every member of the
> league sits in `new_entries`. A poller reading only the standings array
> discovers nobody — silently.

The two arrays also have different shapes. `standings` gives `player_name`;
`new_entries` gives `player_first_name` and `player_last_name` separately, plus
**`joined_time`**, which exists nowhere else and disappears once a manager is
ranked. It is captured on first sight and never overwritten, because it is the
only accurate source for `joined_gw`.

Page 1 of both arrives in a single response, so the base URL is fetched once;
extra requests happen only on genuine `has_next` pagination.

---

## Scoring — `lib/scoring/`

### `month.ts`

A gameweek belongs to the month of its **deadline**, not of the matches played.
Deterministic and easy to explain when December turns out to hold six gameweeks
and August two.

`monthKeyOf` formats in the configured timezone via `en-CA`, which yields
ISO-ordered parts, so `YYYY-MM` falls out without hand-rolled timezone
arithmetic. This matters on boundaries: a 20:00 UTC deadline on 31 August is
still August in London but already September in Sydney.

The month key is **stored** on `gameweeks`, not derived at read time, so
changing `TIMEZONE` mid-season cannot silently reshuffle historical tables.

### `tables.ts`

- `pointsAfterCost(row)` — gross minus transfer cost. Named explicitly because
  FPL's own `points` means the opposite; a bare `points()` returning the net
  figure invites exactly the confusion that causes gotcha 4.
- `aggregate()` — folds raw rows into one total per manager. **Every manager
  appears, even with no eligible gameweeks**: a missing row is otherwise
  indistinguishable from a zero, which hides bugs.
- `comparator(order)` — builds the sort from `TIEBREAK_ORDER`. A null overall
  rank sorts last rather than winning by accident.
- `rank()` — managers surviving every configured rule **share** a rank; ranks
  then resume at the correct number (1, 1, 3).
- `declareWinner()` — records `decidedBy`, the rule that actually separated
  first from second, so the UI can say how it was won.

Transfer costs are never derived from the transfer count. `event_transfers_cost`
is FPL's own figure and already accounts for banked free transfers (up to five)
and for Wildcard and Free Hit weeks, which cost nothing. Recomputing it would
get exactly those weeks wrong.

---

## Sync — `lib/sync.ts`

Mirrors reference data: the league row, the 38 gameweeks, and the membership.
Every write is an upsert, so it is safe on every poll (gotcha 6).

`joined_time` and `joined_gw` are written once and **never overwritten** — a
later poll would otherwise clear `joined_time` (it vanishes once a manager is
ranked) and silently change which gameweeks count for them.

---

## The poller — `lib/poll.ts`, `app/api/poll/route.ts`

The only thing that writes scores. Runs hourly; almost every run does nothing.

### A run

```
1. insert poll_runs (started_at)
2. syncReferenceData()                       ← gameweeks, members, league
3. select gameweeks where data_checked and processed_at is null
4. none? → outcome 'skipped', done           ← the common case
5. fetch every member's history, concurrency-capped
6. for each pending gameweek:
     build rows from the histories
     upsert gw_scores
     declare the weekly winner
     mark processed_at
     declare the monthly winner if that whole month has settled
7. update poll_runs (outcome, detail)
```

### Why it is built this way

**Gated on `data_checked`, never `finished`.** Bonus points settle an hour or
more after the final whistle, and stat corrections land days later. Declaring on
`finished` means declaring the wrong winner and retracting it (gotcha 2).

**Histories are fetched once per run, not per gameweek.** One call returns a
manager's whole season, so processing three pending gameweeks costs the same
requests as processing one.

**Idempotent in two layers** (gotcha 6). `processed_at IS NULL` decides whether
a gameweek is considered at all; every write is an upsert. Re-running over the
same data changes nothing — which is what will stop the WhatsApp publisher
double-posting.

**Self-healing.** Step 3 asks "which settled gameweeks are unprocessed?", not
"what happened since last time". A missed run is picked up by the next one
through the ordinary path, so there is no separate backfill script to write and
forget to test.

**A gameweek with no rows gets a bounded retry, then is closed out.** A failed
fetch throws and aborts the run, so reaching the empty case means the histories
came back cleanly and genuinely contain nothing for that gameweek — normal when
every member registered with FPL after it was played. Retrying forever would
refetch every history hourly to re-learn the same thing, so the gameweek is left
pending for 24 hours after its deadline in case of a race, then marked processed
with no winner declared.

### Call volume

Per hourly run: one standings request, plus `bootstrap-static` at most once per
`BOOTSTRAP_CACHE_HOURS` (default 24; the payload is ~1.4 MB and near-static).
The per-manager history calls fire only when a gameweek actually settles —
roughly weekly, not hourly.

### The route

`GET /api/poll`, because that is what Vercel Cron issues. When `CRON_SECRET` is
set it requires `Authorization: Bearer <secret>`; without it, anyone can burn
your rate limit.

`skipped` returns **200**, not an error — it is the normal, healthy outcome.
Only a genuine failure returns 500, so cron alerting stays meaningful.

Schedule is `17 * * * *` rather than `0 * * * *`: section 11 asks for a
per-instance offset within the hour so that many self-hosted instances do not
all hit the API on the stroke.

---

## Reading and rendering — `lib/view.ts`, `app/`, `components/`

`getLeaderboardView()` builds the entire page payload in one place, reading
either Postgres or the checked-in fixtures, then running the same scoring
functions over either. The client component receives plain data and decides only
which tab to show — no fetching, no scoring.

Two derivations that are easy to get wrong:

- **Season label** comes from the *opening* year (`2026/27`). Deriving it from
  the last loaded gameweek reads `2026/26` whenever only early rounds exist.
- **"Next gameweek"** is the first **unsettled** one, not the next future
  deadline. Mid-round — kicked off but not settled — the useful answer is the
  round you are waiting on.

### Client state

Only `tab`, `gw`, `month`, `page`, `query` and `dark`. Everything else is
server-rendered.

Tables are keyed by tab and gameweek so switching remounts them and resets
pagination; a stale page 3 on a one-page table renders as an empty leaderboard.
The page index is also clamped, since searching can shrink the list underneath it.

Search is gated by `SHOW_SEARCH`, defaulting to `auto`: shown only once the
league exceeds one page, because most mini-leagues have nothing to search.
Filtering keeps **true league ranks** rather than renumbering — you want to see
that you are 35th.

### Theme

Design tokens are CSS variables on `:root`, with `--accent` and `--pop` injected
by the server from config. Dark mode swaps the same names under
`[data-theme="dark"]`. A blocking inline script in `layout.tsx` applies the
stored preference before first paint, because the 200ms token transition makes
a flash very visible.

### Icons — `app/api/icon.svg`, `app/apple-icon.tsx`

Generated from the configured colours, so a self-hosted instance gets an icon in
its own theme rather than someone else's branding.

Pure geometry, no letterform: a mark set in a webfont cannot be drawn by a
standalone SVG, which has no access to the page's fonts — an earlier version
fell back to Impact and rendered wrongly.

The SVG carries its own `prefers-color-scheme` block, so it follows the **OS**
theme, not the in-page toggle; it is painted alongside the browser chrome.
`apple-icon.tsx` rasterises the same mark because iOS will not take an SVG, and
that path needs `lib/color.ts` — Satori cannot parse `oklch()`, which is what
the theme is authored in.

Served with `max-age=0` and an ETag. A long max-age makes a theme change appear
to do nothing, on top of the browser's own aggressive favicon caching.

---

## Fixtures — `lib/fixtures/mock.ts`

`USE_FIXTURES=1` renders a deterministic mock league instead of reading
Postgres. Two purposes: finishing the design before the season starts, and
letting the app run and the tests pass without touching the live API.

The 38 deadlines are the **real** 2026/27 ones, so the month grouping the mock
produces matches what live data will do. One manager joins at GW4 so the
pre-join rule is visible rather than theoretical.

Only the data source is mocked. Scoring and table building are the real,
tested functions.

---

## Database

Schema in `lib/db/schema.ts`, migrations in `drizzle/`.

The design decision worth preserving: `gw_scores` holds **raw per-gameweek
rows**, not only computed tables. Any scoring rule — tie-break order, the
pre-join question — can then be recalculated retroactively without refetching
anything from the API.

Migrations run over the **direct** connection (`DATABASE_URL_UNPOOLED`);
drizzle-kit needs a session-level connection and fails over a pooler. The app
uses the pooled one, because serverless functions open many short-lived
connections.

`drizzle-kit generate` needs a TTY to disambiguate a column rename from a
drop-and-create. In a non-interactive shell, hand-write the `ALTER TABLE …
RENAME COLUMN` migration and splice in a snapshot generated from a throwaway
history — see `drizzle/0003_rename_points_columns.sql`.

---

## Tests

`pnpm test`. Vitest, on the parts that must not be wrong:

- `scoring/tables` — points, aggregation, tie-breaks, shared ranks, winner
  declaration, pre-join handling, chips.
- `scoring/month` — deadline-to-month mapping, timezone and BST boundaries,
  join-gameweek derivation.
- `poll` — mapping FPL history into score rows: gross carried across unaltered,
  absent managers omitted rather than zeroed, chips attached to the right week.
- `color` — oklch conversion, pinned to the sRGB primaries, which have known
  oklch coordinates.

There is deliberately no test for the UI layout. The scoring is what causes
arguments; the layout is what you can see.

---

## Local commands

```
pnpm dev          # dev server
pnpm test         # unit tests
pnpm sync         # refresh gameweeks and membership
pnpm poll         # run the poller by hand
pnpm db:check     # verify both connection strings answer
pnpm db:generate  # create a migration from schema changes (needs a TTY)
pnpm db:migrate   # apply migrations
```
