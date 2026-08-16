# fpl-mates

A leaderboard for a Fantasy Premier League mini-league, with the competitions
FPL does not give you: **a weekly winner, a monthly winner, and a running
record of who has won what.**

FPL shows your mini-league a single season-long table. This adds the weekly and
monthly ones, works them out from the same official data, and states the rules
in force under every table so nobody has to argue about them.

![The leaderboard in light mode](docs/screenshots/light.jpg)
![The same page in dark mode](docs/screenshots/dark.jpg)

<sub>Screenshots use the demo data checked into this repo, not a real league.</sub>

---

## What it does

- **Weekly table** — every gameweek scored and ranked, with a declared winner
- **Monthly table** — gameweeks grouped by month, with a monthly winner
- **Season table** — the cumulative standings
- **History** — every weekly and monthly winner so far
- **Live scores** — provisional points while matches are being played, clearly
  marked as provisional, with a fixtures grid and a countdown to the deadline
- **Light and dark**, and it works on a phone

Everything updates on its own. Nobody enters a score by hand.

---

## Deploy your own

Five minutes, and it costs nothing on the free tiers.

### 1. Find your league ID

Open your mini-league on the FPL site and read the number out of the URL:

```
https://fantasy.premierleague.com/leagues/123456/standings/c
                                          ^^^^^^
```

### 2. Create a database

Sign up at [neon.tech](https://neon.tech) and create a project. Pick the region
closest to where you will deploy. From *Connection Details*, copy **both**
connection strings — the pooled one (its host contains `-pooler`) and the direct
one.

### 3. Deploy

Fork this repository, then import it at [vercel.com](https://vercel.com). Set
two environment variables:

| Variable | Value |
|---|---|
| `FPL_LEAGUE_ID` | the number from step 1 |
| `DATABASE_URL` | the **pooled** Neon connection string |

That is genuinely all that is required. Everything else has a working default.

Two more are worth adding:

| Variable | Why |
|---|---|
| `DATABASE_URL_UNPOOLED` | the direct Neon string; migrations need a session connection and fail over a pooler |
| `CRON_SECRET` | any long random string, so only your cron can trigger the poller |

### 4. Create the tables

```bash
pnpm install
cp .env.example .env.local     # fill in the same values
pnpm db:migrate
```

### 5. Check it works

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/poll
```

`{"outcome":"skipped"}` is the healthy answer between gameweeks — it means the
API was reachable, the database was written, and there is nothing to score yet.

A `FUNCTION_INVOCATION_TIMEOUT` here almost always means `FPL_LEAGUE_ID` points
at a public league rather than your mini-league. Those hold tens of thousands of
members and page for minutes, so the poller refuses anything above
`MAX_LEAGUE_MEMBERS` (1,000) instead of being killed without explanation.

### Keeping it up to date

`vercel.json` runs the poller daily. **Vercel's Hobby plan rejects any cron that
runs more than once a day**, so there is also a GitHub Actions workflow
(`.github/workflows/poll.yml`) that calls the same endpoint hourly for free. To
use it, set two repository secrets:

- `POLL_URL` — `https://your-app.vercel.app/api/poll`
- `CRON_SECRET` — the same value you set in Vercel

Both together is fine. The poller processes whatever is outstanding rather than
only what is new, so overlapping runs are harmless and a missed one is caught up
automatically.

---

## Telegram bot (optional)

A bot that answers commands and posts the result into your group when a
gameweek is confirmed. Free, and setup takes about a minute.

1. Message [@BotFather](https://t.me/botfather), send `/newbot`, follow the
   prompts. It gives you a token — that is `TELEGRAM_BOT_TOKEN`.
2. Add the bot to your group. To find the chat id, send any message there, open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read
   `result[0].message.chat.id`. A group id is negative, a private chat is
   positive — using the wrong sign returns "chat not found", which reads like a
   permissions problem. `getUpdates` returns nothing once a webhook is set, so
   do this before step 3.
3. Register the webhook so commands work:

   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-site/api/telegram&secret_token=<SECRET>"
   ```

   Omit `secret_token` if you have not set `TELEGRAM_WEBHOOK_SECRET`; if the two
   ever disagree, every command silently stops working. `getWebhookInfo` reports
   the reason in `last_error_message`.

   The secret may only contain `A-Z a-z 0-9 _ -`, so a bot token cannot be used
   as one — and should not be, since it is a separate credential.

| Command | Returns |
|---|---|
| `/table` | season standings |
| `/gw` `/gw 5` | a gameweek — the live one if a match is on |
| `/month` `/month August` | a month's table |
| `/winners` | weekly and monthly winner history |
| `/fixtures` | fixtures and live scores |
| `/next` | next deadline |
| `/help` | the list |

The bot also answers `/season`, `/gameweek`, `/monthly` and `/live` as aliases.

To get Telegram's autocomplete menu, send `/setcommands` to BotFather, pick your
bot, and paste:

```
table - season standings
gw - a gameweek, latest if omitted
month - a month, current if omitted
winners - weekly and monthly winners
fixtures - fixtures and live scores
next - next deadline
help - list the commands
```

Set `TELEGRAM_CHAT_ID` and the bot also announces each gameweek as it is
confirmed — the same moment the winner is recorded, guarded so a reprocessed
gameweek is never posted twice.

Bots in groups only see messages beginning with `/`. Telegram calls this privacy
mode, and it means the bot cannot read the rest of your conversation.

---

## How the scoring works

Read this before pointing your league at it — these are the rules your group
will be arguing about, and they are all changeable.

**Points are after transfer costs.** FPL charges 4 points for each transfer
beyond your free ones. A manager who scores 80 with a −8 finishes *below* one
who scores 74 clean. Wildcard and Free Hit gameweeks cost nothing, and banked
free transfers (up to five) are free — the deduction always comes from FPL's own
figure, never from counting transfers.

**A gameweek belongs to the month of its deadline**, not the month the matches
were played in. This is deterministic and easy to explain, and it means months
hold unequal numbers of gameweeks — two in August, six in December. That is
expected, not a bug.

**Ties break in a configurable order**, by default: higher score, then fewer
points lost to transfers, then fewer points left on the bench, then better
overall FPL rank. Survive all four and the win is shared.

**Nothing counts until FPL confirms it.** Bonus points settle an hour or more
after the final whistle, and corrections land days later. Live scores are shown
while matches are played, but no winner is recorded until the gameweek is final.

**Managers score from the gameweek they joined the league**, not from the start
of the season. Somebody joining at GW10 arrives with GW1–9 already on FPL's
record; counting those would let them win a month they were not in. Set
`COUNT_PREJOIN_GWS=true` if you would rather count everything.

> **If you set this up mid-season**, every gameweek so far is backfilled on the
> first poll — FPL's history endpoint returns the whole season, so you get the
> weekly and monthly winners from Gameweek 1 without doing anything.
>
> What is *not* recoverable is join dates. FPL only reports a join time while a
> manager is unranked, so anyone already in the table when you first run the
> poller is treated as present from Gameweek 1 — which is
> `COUNT_PREJOIN_GWS=true` behaviour for them whatever you set. Members who join
> *after* you start are dated correctly. Starting before the season avoids this
> entirely.

Whatever you configure is printed underneath every table, so nobody has to read
the source to find out how they lost.

---

## Configuration

Only `FPL_LEAGUE_ID` and `DATABASE_URL` are required. See
[`.env.example`](.env.example) for all of them, commented — including the
tie-break order, timezone, theme colours, live scoring, and the optional
WhatsApp publisher.

A missing optional variable turns a feature off. It never breaks the poller.

### One database per league

`FPL_LEAGUE_ID` is not a switch you can flip on a running instance. Only the
`league` table is keyed by league id — managers, scores and winners are not —
so pointing an existing database at a different league leaves the previous
league's history in place and mixed with the new one.

The sync marks departed members inactive, so they drop out of the tables on the
next poll. What it cannot undo is the rest:

- **Winners already declared** stay. `weekly_winners` is keyed by gameweek and
  `monthly_winners` by month, neither of which changes with the league.
- **Gameweeks already scored** are never rescored. `processed_at` marks them
  done, so the new league's members get nothing for any gameweek that settled
  before the change, and sit on zero while the old members carry full totals.

Run a second league in a second database. A Neon branch takes seconds and costs
nothing:

```bash
# new DATABASE_URL + new FPL_LEAGUE_ID, then
pnpm db:migrate
```

To reuse a database anyway, wipe it rather than reconfigure it:

```sql
TRUNCATE managers, league, poll_runs RESTART IDENTITY CASCADE;
UPDATE gameweeks SET processed_at = NULL;
```

The cascade clears `gw_scores`, `entry_picks` and both winners tables.
`gameweeks` is FPL-wide rather than league-specific, so it stays — clearing
`processed_at` is what makes the poller score it all again. Then `pnpm sync`.

Before the season this matters much less: with nothing scored and no winners
declared, a sync alone is enough:

1. Change `FPL_LEAGUE_ID`, then **redeploy** — a Vercel deployment carries the
   values it was built with, so the change does nothing until then.
2. Force a sync rather than waiting for the hour: **GitHub → Actions → "Poll
   FPL" → Run workflow**, or the `curl` under [Forcing a sync](#forcing-a-sync).

The new members appear and the old ones drop out on that run, since anyone
absent from the roster is marked inactive. Their rows stay in the database but
no longer count.

### Switching mid-season

Once gameweeks have settled, two costs cannot be undone.

**Join dates are lost.** FPL reports `joined_time` only while a manager is
unranked, so everyone already ranked in the new league arrives without one and
counts from Gameweek 1 — `COUNT_PREJOIN_GWS=true` behaviour whether you set it
or not.

Everything else recovers: FPL's history endpoint returns all past gameweeks, so
scores and tables rebuild accurately, and a run that processes several
gameweeks at once announces only the newest — the rest are marked as posted
without being sent, so your group does not get a dozen messages at once.

1. New database, then `pnpm db:migrate`
2. Change `FPL_LEAGUE_ID`, then redeploy
3. Run the poller until it has caught up

Better: settle on the league before the first deadline, and run a second
instance rather than repointing this one.

### Forcing a sync

The poller runs hourly, so nothing here is required — it is for when you have
just changed configuration and do not want to wait.

- **GitHub → Actions → "Poll FPL" → Run workflow.** Uses the repository
  secrets, so nothing to type.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/poll`
- `pnpm sync` locally, against whatever `DATABASE_URL` is in your `.env.local`.

Environment variables are baked into a Vercel deployment, so changing one in
the dashboard does nothing until the next deploy. Redeploy first, then sync.

The theme is configurable end to end: set `ACCENT_COLOR` and `POP_COLOR` and the
page, the favicon and the link-preview image all follow, because all three are
generated from the same values.

---

## Running locally

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

No database and no league to hand? Set `USE_FIXTURES=true` and it renders a
deterministic demo league from `lib/fixtures/`. That is what the screenshots
above show, and it is how the tests run without touching the live API.

```bash
pnpm test        # unit tests: scoring, tie-breaks, month mapping, bonus
pnpm sync        # refresh gameweeks and membership by hand
pnpm poll        # run the poller by hand
pnpm db:check    # verify both connection strings answer
```

---

## Documentation

- [docs/internals.md](docs/internals.md) — how each part works, and why
- [docs/ROADMAP.md](docs/ROADMAP.md) — what is not built yet
- [docs/technical-brief.md](docs/technical-brief.md) — the original specification

---

## Disclaimer

**Not affiliated with, endorsed by, or connected to the Premier League or
Fantasy Premier League.** It reads an undocumented public API that may change or
stop working without notice. Run it at your own risk. See [NOTICE.md](NOTICE.md).

## Licence

[MIT](LICENSE).
