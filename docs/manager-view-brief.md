# Manager view — design brief

Clicking a row in any table opens that manager's squad for a gameweek.

Written so the design is built against data that actually exists. Everything
under "Available" can be shown at no extra cost; everything under "Not
available" needs a decision before it appears in a mockup.

> **Verification status.** The picks and live endpoints return nothing until a
> deadline has passed — `entry/{id}/event/{n}/picks/` answers `{"detail":"Not
> found."}` and `event/{n}/live/` answers with an empty list. So the field list
> below comes from the schemas this app already declares, not from a response
> anyone has inspected. Confirm it against a real gameweek before building the
> parts marked **unconfirmed**.

---

## Available

All of this comes from requests already made, or from one request per manager
per gameweek that is then cached forever — picks freeze at the deadline and
cannot change.

**The squad**

- 15 players in FPL's own order. Positions 1–11 are the starting XI, 12–15 the
  bench, and bench position 12 is always the reserve goalkeeper.
- Position per player: GK, DEF, MID or FWD.
- Club per player, as a three-letter code — ARS, MUN, NEW.
- Player name as FPL's `web_name`: usually a surname, occasionally longer.
  Budget for 16 characters (`Alexander-Arnold`).

**Roles**

- Captain, and whether it is a Triple Captain.
- Vice-captain.
- Bench order, which decides who comes on first.

**Scoring**

- Points per player for that gameweek.
- Minutes played per player — the difference between a blank and a player who
  has not kicked off yet.
- Bonus per player: confirmed once FPL applies it, provisional from BPS while
  matches are in play. The provisional calculation already exists.

**Gameweek context**

- Chip played: Bench Boost, Triple Captain, Free Hit, Wildcard, or none.
- Transfer cost for the week, as a negative number.
- Total for the gameweek, gross and after the hit.

---

## Not available

Ask before designing these in.

**Transfers made that week.** A separate endpoint, `entry/{id}/transfers/`,
confirmed to exist and to return an array — empty until someone makes a
transfer. One request per manager covers their whole season, so it is
affordable, but it is a decision rather than a freebie.

**Price paid for a player.** The API gives the current price, not the price
when they bought. Showing today's price next to a squad from Gameweek 3 would
be quietly wrong.

**Automatic substitutions** — *unconfirmed*. FPL swaps a non-playing starter
for a bench player when a gameweek ends. This is believed to be reported in the
picks response, but that cannot be checked until a gameweek has been played, and
nothing here reads it today. Until it is confirmed, a settled squad can only be
shown as it was picked, which is not always what finally scored.

**A per-player points breakdown** — *unconfirmed*. The live endpoint is thought
to carry an `explain` field saying why each player scored — minutes, goals,
assists, clean sheet, bonus. It would be the most interesting thing on the
screen, so it is worth confirming on the first real gameweek before designing
either with or without it.

---

## States to design

The same squad renders very differently depending on when it is looked at.

**Before kickoff.** Teams are locked, nobody has played, every player is on
zero. Minutes are the only signal, and they are all zero too.

**In play.** Points moving, bonus provisional and still able to change, some
players yet to kick off, others finished. This needs to be visibly provisional
— the tables use amber for exactly this.

**Settled.** Final points, confirmed bonus, auto-substitutions applied.

**Chips.** Each changes what the squad means:

- **Bench Boost** — all 15 score, so the bench is not inactive and cannot be
  dimmed.
- **Triple Captain** — captain multiplier is 3, not 2.
- **Free Hit** — this squad exists for one week only and reverts afterwards.
- **Wildcard** — unlimited transfers, no hit, so no negative to show.

---

## Designing before a gameweek exists

Nothing above blocks the design. The two unconfirmed items are both additive,
so leaving a slot for each avoids a redraw:

- **A swap indicator** on one starter and one bench player, if automatic
  substitutions turn out to be reported.
- **A detail area inside a player row**, if the per-player breakdown exists.

### Real name lengths

Measured from the current player list, not guessed:

- 95% of names are **11 characters or fewer** — `Haaland`, `Saka`, `Palmer`.
- The longest run to 16: `Borges Rodrigues`, `Bendito Mantato`.
- Some carry diacritics — `Milosavljević` — so the font has to cover them.

Design comfortably for 12, truncate past 16.

### A real squad to draw with

Actual players, a legal 3-4-3, priciest in each position:

```
 1  GK   Raya           ARS
 2  DEF  Gabriel        ARS
 3  DEF  J.Timber       ARS
 4  DEF  Virgil         LIV
 5  MID  B.Fernandes    MUN
 6  MID  Saka           ARS
 7  MID  Palmer         CHE
 8  MID  Semenyo        MCI   (C)
 9  FWD  Haaland        MCI   (V)
10  FWD  Isak           LIV
11  FWD  Watkins        AVL
     -- bench --
12  GK   Pickford       EVE
13  DEF  O'Reilly       MCI
14  DEF  Saliba         ARS
15  MID  Mbeumo         MUN
```

Note `J.Timber` and `B.Fernandes`: FPL abbreviates first names to disambiguate
players sharing a surname, and `O'Reilly` carries an apostrophe.

## Constraints

**Phones first.** The tables already fold to three columns below 640px. A
pitch-shaped layout is the obvious FPL idiom but is hard to read on a narrow
screen; a list grouped by position may serve better, or the two may need
different layouts.

**The formation varies.** 3-4-3, 4-4-2, 3-5-2, 5-4-1 — the design cannot assume
a fixed shape. Between three and five defenders, one and three forwards.

**Which gameweek.** Opening from the Gameweek 5 table should show the Gameweek
5 squad. Opening from the season or monthly table has no single answer — the
latest gameweek is the sensible default, but it needs deciding.

**Getting back.** Whatever this is — a modal, a drawer, a page — returning to
the table must not lose the tab, gameweek or page the reader was on.

---

## Suggested split

**First: the current gameweek only.** Picks and live points are both already
loaded for the gameweek in play, so this costs no additional requests at all
and covers the moment people care most — during matches.

**Then: any past gameweek.** One request per manager per gameweek, cached after.
Cheap individually, but it is the version that needs the auto-substitution
question answered, since a settled squad shown without them is inaccurate.

**Only if wanted: transfers.** One more request per manager, and the most
interesting thing to a group arguing about who wasted a hit.
