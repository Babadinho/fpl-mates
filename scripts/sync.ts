/**
 * Manually refresh gameweeks and league membership.
 * Usage: pnpm sync
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

async function main() {
  const { syncReferenceData } = await import('../lib/sync');
  const startedAt = Date.now();
  const result = await syncReferenceData();

  console.log(`synced in ${Date.now() - startedAt}ms`);
  console.log(`  league    ${result.leagueName}`);
  console.log(`  gameweeks ${result.gameweeks}`);
  console.log(`  members   ${result.members}`);
  if (result.deactivated > 0) {
    console.log(`  left      ${result.deactivated} no longer in the league`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
