/**
 * Run the poller by hand.
 * Usage: pnpm poll
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

async function main() {
  const { runPoll } = await import('../lib/poll');
  const result = await runPoll();
  console.log(`outcome   ${result.outcome}`);
  console.log(`detail    ${result.detail}`);
  console.log(`processed ${result.processed.length ? result.processed.join(', ') : '(none)'}`);
  console.log(`duration  ${result.durationMs}ms`);
  process.exit(result.outcome === 'error' ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
