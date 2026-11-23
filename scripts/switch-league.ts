/**
 * Points this database at a different league and rescores the season for it.
 * Nothing is deleted: the old league's members drop out as inactive, and
 * switching back brings them back.
 * Usage: pnpm switch-league <league id>
 */
import { config as loadEnv } from 'dotenv';

const leagueId = Number(process.argv[2]);

if (!Number.isInteger(leagueId) || leagueId <= 0) {
  console.error('Usage: pnpm switch-league <league id>');
  process.exit(1);
}

// Set before .env.local loads, which never overrides an existing variable, so
// everything below runs against the new league.
process.env.FPL_LEAGUE_ID = String(leagueId);
loadEnv({ path: '.env.local', quiet: true });

async function main() {
  const { desc, eq } = await import('drizzle-orm');
  const { getDb } = await import('../lib/db');
  const { gameweeks, league } = await import('../lib/db/schema');
  const { fetchLeagueRoster } = await import('../lib/fpl/client');
  const { currentSeason } = await import('../lib/season');
  const { runPoll } = await import('../lib/poll');

  const db = getDb();
  const [current] = await db
    .select({ id: league.id, name: league.name })
    .from(league)
    .orderBy(desc(league.syncedAt))
    .limit(1);
  if (current?.id === leagueId) {
    console.log(`Already on ${current.name} (${leagueId}). Nothing to do.`);
    return;
  }

  // Confirms the ID exists and is small enough to poll before changing anything.
  const roster = await fetchLeagueRoster(leagueId);
  console.log(`from  ${current ? `${current.name} (${current.id})` : '(no league yet)'}`);
  console.log(`to    ${roster.leagueName} (${leagueId}), ${roster.members.length} members`);

  // Scoring overwrites rather than appends, so marking the season unscored is
  // all a rescore needs. It also clears the league guard for the new ID.
  const season = await currentSeason();
  if (season !== null) {
    await db
      .update(gameweeks)
      .set({ processedAt: null })
      .where(eq(gameweeks.season, season));
  }

  console.log('\nRescoring the season for the new league...');
  const result = await runPoll();
  console.log(`outcome    ${result.outcome}`);
  console.log(`processed  ${result.processed.length ? result.processed.join(', ') : '(none yet)'}`);
  if (result.outcome === 'error') {
    console.log(`detail     ${result.detail}`);
    console.log(`\nRun \`FPL_LEAGUE_ID=${leagueId} pnpm poll\` to finish.`);
    process.exit(1);
  }

  console.log(
    `\nNow set FPL_LEAGUE_ID=${leagueId} in Vercel and redeploy. Until then, ` +
      `scheduled polls still use the old ID: they stop with an error once a ` +
      `gameweek is scored, but before that they switch straight back.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
