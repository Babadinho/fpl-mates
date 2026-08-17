# Manager view — available fields

What FPL gives us for a single manager's squad in a single gameweek.

> **Verification status.** Picks and live both return nothing until a deadline
> has passed — `entry/{id}/event/{n}/picks/` answers `{"detail":"Not found."}`
> and `event/{n}/live/` answers an empty list. The list below is what this app's
> schemas declare, not a response anyone has inspected. Items marked
> **unconfirmed** need checking against a real gameweek:
> `pnpm exec tsx scripts/check-shapes.ts <entryId> <gameweek>`.

---

## Per squad

| Field | Values |
|---|---|
| Players | Exactly 15 |
| Starting XI | Pick positions 1–11 |
| Bench | Pick positions 12–15, in the order they come on |
| Reserve goalkeeper | Always pick position 12 |
| Formation | 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD in the XI |
| Chip | `bboost`, `3xc`, `freehit`, `wildcard`, or none |
| Transfer cost | 0, or a multiple of 4 |
| Gameweek points | Gross, and after the transfer cost |

## Per player

| Field | Values |
|---|---|
| Name | FPL's `web_name`. See lengths below |
| Position | GK, DEF, MID, FWD |
| Club | Three-letter code — `ARS`, `MUN`, `LIV` |
| Multiplier | 0 benched, 1 playing, 2 captain, 3 triple captain |
| Captain | Boolean |
| Vice-captain | Boolean |
| Points | For this gameweek |
| Minutes | 0–90+. Separates a blank from a player yet to kick off |
| Bonus | Confirmed after the match; provisional from BPS during it |
| Price | Current price only — not the price paid |

### Name lengths

Measured from the current player list:

- 95% are 11 characters or fewer — `Haaland`, `Saka`, `Palmer`
- The longest reach 16 — `Borges Rodrigues`, `Bendito Mantato`
- Diacritics occur — `Milosavljević`
- First initials disambiguate shared surnames — `J.Timber`, `B.Fernandes`
- Apostrophes occur — `O'Reilly`

---

## Not available

**Transfers that week.** A separate endpoint, `entry/{id}/transfers/` —
confirmed to exist, returns an array, one request covers a whole season.

**Price paid.** The API reports current price only.

**Automatic substitutions** — *unconfirmed*. FPL replaces a non-playing starter
with a bench player once a gameweek ends, which changes what the final XI was.
Believed to be in the picks response; not read today.

**Anyone's squad before a deadline.** Teams exist and are edited right up to
the deadline, but FPL keeps them private until it passes — `entry/{id}/event/
{n}/picks/` answers `{"detail":"Not found."}` even for your own entry. The
authenticated `my-team/{id}/` endpoint does return a draft, but only for the
manager who is logged in, so it cannot show a league. Apps that display your
prospective team are signed in as you.

**Per-player points breakdown** — *unconfirmed*. The live endpoint is thought to
carry an `explain` field itemising each player's points — minutes, goals,
assists, clean sheet, bonus.

---

## Data states

The same squad carries different values depending on when it is read.

| State | Points | Minutes | Bonus |
|---|---|---|---|
| Deadline passed, no kickoff | All zero | All zero | None |
| In play | Moving | Partial | Provisional, can still change |
| Settled | Final | Final | Confirmed |

## What each chip changes

| Chip | Effect on the data |
|---|---|
| Bench Boost | All 15 players score, not 11 |
| Triple Captain | Captain multiplier is 3 |
| Free Hit | Squad applies to this gameweek only |
| Wildcard | Transfer cost is 0 |

---

## Request cost

| Data | Cost |
|---|---|
| One manager's picks for one gameweek | 1 request, then cached permanently — picks freeze at the deadline |
| Every player's points for a gameweek | 1 request, covers all managers |
| Player names, positions, clubs | 0 — already in the bootstrap payload we download |
