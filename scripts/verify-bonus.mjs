// Checks the stored bonus figures against FPL's own numbers.
// Usage: pnpm verify:bonus [event] [managers]   (loads .env.local via --env-file)
//
// Bonus is the one column the app derives rather than reads. Points come
// straight from FPL's history endpoint and are authoritative, so a mistake in
// how picks are counted -- an automatic substitution applied wrongly, say --
// leaves Points correct and quietly corrupts only Bonus. Nothing errors and
// nothing looks odd.
//
// This reconstructs each manager's GROSS points from their picks and the live
// feed, using the exact arithmetic lib/settle.ts uses, and compares against
// what FPL reports. Bonus is a subset of that same sum, so a total that
// reproduces FPL's is proof the multipliers were right.
//
// Run it after a gameweek settles. `subs` in the output is what matters: a run
// reporting autosubs AND all-match is the one that proves the substitution
// path, which unit tests can only approximate.
const BASE = 'https://fantasy.premierleague.com/api';
const UA = 'fpl-mates/0.1.0 (+verification)';

const event = Number(process.argv[2] ?? 0);
const limit = Number(process.argv[3] ?? 50);
const league = process.env.FPL_LEAGUE_ID;

if (!league) {
  console.error('FPL_LEAGUE_ID is not set. Run via pnpm verify:bonus so .env.local is loaded.');
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

const bootstrap = await get('bootstrap-static/');
const settled = bootstrap.events.filter((e) => e.data_checked).map((e) => e.id);

// Default to the most recent settled gameweek: the one just processed is the
// one worth checking, and an unsettled gameweek has no final bonus to compare.
const target = event || settled.at(-1);

if (!target) {
  console.log('No gameweek has settled yet, so there is nothing to verify.');
  process.exit(0);
}
// The history endpoint lags the live feed and the standings while a gameweek
// is in flight -- observed 2 points behind on a settled-looking GW1 -- so
// comparing against it early reports mismatches that mean nothing. Which is
// also why the poller waits for data_checked before banking any score.
const provisional = !settled.includes(target);
if (provisional) {
  console.log(
    `GW${target} has not settled. FPL's history endpoint lags its own standings\n` +
      `until it does, so any mismatch below is that lag, not a scoring error.\n`,
  );
}

const standings = await get(`leagues-classic/${league}/standings/`);
const entries = standings.standings.results.slice(0, limit).map((r) => r.entry);

console.log(`${standings.league.name} · GW${target} · ${entries.length} managers\n`);

const live = await get(`event/${target}/live/`);
const bonusOf = new Map(live.elements.map((e) => [e.id, e.stats.bonus]));
const pointsOf = new Map(live.elements.map((e) => [e.id, e.stats.total_points]));

let mismatches = 0;
let subsSeen = 0;
let preapplied = 0;

for (const entryId of entries) {
  const picks = await get(`entry/${entryId}/event/${target}/picks/`);
  const history = await get(`entry/${entryId}/history/`);
  const row = history.current.find((c) => c.event === target);
  if (!row) continue;

  const subs = picks.automatic_subs ?? [];
  subsSeen += subs.length;

  const raw = new Map(picks.picks.map((p) => [p.element, p.multiplier]));

  // Mirrors applySubs in lib/settle.ts, including its guards.
  const applied = new Map(raw);
  for (const s of subs) {
    if ((applied.get(s.element_out) ?? 0) > 0) applied.set(s.element_out, 0);
    if ((applied.get(s.element_in) ?? 0) === 0) applied.set(s.element_in, 1);
  }

  const sum = (multipliers, source) => {
    let total = 0;
    for (const [element, multiplier] of multipliers) {
      if (multiplier > 0) total += (source.get(element) ?? 0) * multiplier;
    }
    return total;
  };

  const rawGross = sum(raw, pointsOf);
  const gross = sum(applied, pointsOf);
  const bonus = sum(applied, bonusOf);
  const ok = gross === row.points;

  // FPL having already applied the substitution to `multiplier` is fine; the
  // guards above make our swap a no-op. Worth reporting because it tells us
  // which behaviour we are actually dealing with.
  if (subs.length > 0 && rawGross === gross) preapplied++;
  if (!ok) mismatches++;

  console.log(
    `${String(entryId).padStart(8)}  fpl=${String(row.points).padStart(3)}  ` +
      `ours=${String(gross).padStart(3)}  bonus=${String(bonus).padStart(2)}  ` +
      `subs=${subs.length}  ${ok ? 'ok' : 'MISMATCH'}`,
  );
}

console.log(
  `\n${mismatches === 0 ? 'ALL MATCH' : `${mismatches} MISMATCH(ES)`} · ` +
    `${subsSeen} autosub(s) seen${subsSeen ? ` · ${preapplied} already applied by FPL` : ''}`,
);

if (subsSeen === 0) {
  console.log('No autosubs in this sample, so the substitution path is still unproven here.');
}

// Only a settled gameweek can fail: before that a mismatch is FPL's own lag.
process.exit(mismatches === 0 || provisional ? 0 : 1);
