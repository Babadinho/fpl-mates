# Remaining work

Status as of 12 August 2026. The season's first deadline is **Friday 21 August,
18:30 BST**, and GW1 settles roughly 24 August.

Built and tested: configuration, database schema, the FPL client, reference-data
sync, the scoring engine, the full web UI, and the generated icons. See
[internals.md](internals.md) for how each of those works.

---

## Blocking the season

### 1. The poller

Nothing writes a score yet. `gw_scores`, `weekly_winners` and `monthly_winners`
are migrated but empty, and nothing populates them.

Needs `lib/poll.ts` and `app/api/poll/route.ts`. The hard parts already exist —
the client, the sync layer and the scoring functions are all built and tested —
so this is orchestration plus the `data_checked` gate and the idempotency guard.

### 2. Deploy to Vercel, early

Not for launch. For **gotcha 3**: the FPL CDN intermittently returns 403 to
datacentre IPs, which is exactly what Vercel is. The client retries and backs
off, but that behaviour has never been exercised from a real deployment.

If the API turns out to be unreachable from Vercel, the fix is architectural
(a proxy, or moving the poller somewhere with a residential-looking IP) and
needs days, not hours. This is the highest-risk unknown in the project and the
cheapest to settle. **Deploy before the poller is finished if necessary.**

### 3. Cron configuration

`vercel.json` with an hourly schedule hitting `/api/poll`, and `CRON_SECRET`
set in the Vercel dashboard so the route cannot be triggered by anyone else.

### 4. Turn off fixtures

Done — `USE_FIXTURES` is off locally and never set in Vercel, so production
reads the real league. Worth re-checking before the season starts, because the
failure is silent: the site would simply show "The Sunday League" all year.

### 5. Verify by hand once GW1 settles

Phase 1's real acceptance criterion. Cross-check at least one manager's points
against the FPL site before telling the group the leaderboard exists. One wrong
weekly winner destroys trust in the whole thing, and it is very hard to win back.

---

## Required before open-sourcing

None of this affects whether the app works; all of it affects whether anyone
else can run it. Section 11 of the technical brief is the source.

- **`README.md`** is still the `create-next-app` boilerplate. It needs: what the
  project does, screenshots of both themes, the five-minute deploy path
  (fork → Neon → Vercel import → set two variables), and the scoring rules in
  plain English so a new group can decide whether they agree with them.
- **`LICENSE`** — MIT.
- **Disclaimer**, prominently: not affiliated with, endorsed by or connected to
  the Premier League or Fantasy Premier League; uses an undocumented public API
  that may change or stop working; run at your own risk.
- **CI**, with a secret scan so no real value ever lands in the repo.

---

## Later

- **WhatsApp publisher.** Always planned as the second output channel, after the
  web page (section 6). A thin publisher over the same stored results, gated on
  the same `data_checked` check and the same idempotency guard.
- **Season rollover and archive** (gotcha 7). The `current` array resets each
  season, so the 2026/27 rows must be archived before August 2027. Matters
  before next season, not this one.
- **Accent contrast guard.** `--accent-ink` is a fixed near-white against the
  accent background. A light `ACCENT_COLOR` — `yellow`, say — gives white on
  yellow. A luminance check that flips the ink between near-white and near-black
  would fix it. Only affects self-hosters choosing unusual colours.
- **Rename the working directory.** Still `C:\Projects\fpl-gaffer` on disk while
  the repo is `fpl-mates`. Cosmetic; best done between sessions.
- **UI pagination for very large leagues** is implemented, but a sticky table
  header would help more at 200 rows. Not needed for a normal mini-league.
