# Remaining work

Status as of 14 August 2026. The season's first deadline is **Friday 21 August,
18:30 BST**, and GW1 settles roughly 24 August.

The app is live at www.fplmates.com, reading the real league, private behind a
passcode, and polling hourly. See [internals.md](internals.md) for how it works.

---

## Before the season

### Get the rest of the league to join

Two managers so far. Anyone who joins before the GW1 deadline is dated correctly
and counts from GW1; anyone joining later counts from the gameweek they joined.
Not a code task, but the only genuinely deadline-bound one.

### Verify by hand once GW1 settles

The poller has never processed a real gameweek, and the live path has never seen
a real match. The scoring functions are well covered by unit tests, but the
integration — history endpoint to stored rows to declared winner — runs for the
first time on the night of 24 August.

Before telling the group the site exists, cross-check one manager's points
against the FPL site. One wrong weekly winner is very hard to walk back.

If something looks wrong: `poll_runs` records every run and its outcome,
`pnpm poll` re-runs by hand, and clearing `processed_at` on a gameweek makes the
next run redo it from scratch.

---

## Decided against: the WhatsApp bot

The brief planned a bot posting the table into the group chat. Not being built,
for two reasons.

**The official API probably cannot do it.** The WhatsApp Business Cloud API is
built for business-to-consumer 1:1 messaging; posting into an ordinary group
chat is not something it supports. Worth re-checking if this is ever revisited,
since Meta's capabilities move.

**Everything that can do it is unofficial.** Baileys, green-api and similar work
by impersonating the WhatsApp client. That breaches the terms and gets phone
numbers banned — the brief warns about this explicitly.

What is left officially — 1:1 messages to each member who has opted in, or a
broadcast Channel — is worse than simply sharing the link, which already
produces a proper preview card.

The `WHATSAPP_*` variables remain in the configuration and do nothing while
unset. The footer line about posting to WhatsApp only appears if they are set,
so it currently never shows.

---

## Worth doing

- **Season rollover.** `history.current` resets every August, so the 2026/27
  rows must be archived before the 2027/28 season starts. Breaks silently and a
  year from now, which is exactly the kind of thing that gets forgotten.
- **Accent contrast guard.** `--accent-ink` is a fixed near-white on the accent
  background, so a light `ACCENT_COLOR` gives unreadable text. A luminance check
  that flips the ink between near-white and near-black would fix it. Only
  affects self-hosters choosing unusual colours.
- **A shareable summary.** A button that copies the gameweek result as text to
  paste into the group — the part of the WhatsApp idea that was actually wanted,
  without an API, an approval process or a bannable account.
- **Rename the working directory.** Still `fpl-gaffer` on disk while the repo is
  `fpl-mates`. Cosmetic; best done between sessions.
- **Sticky table header** for very large leagues. Pagination is implemented, but
  at 200 rows a sticky header helps more.
