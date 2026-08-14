/**
 * Sends a test message to the configured chat.
 * Usage: pnpm telegram:test [command]     e.g. pnpm telegram:test /table
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

async function main() {
  const { getConfig } = await import('../lib/config');
  const { telegram } = getConfig();

  if (!telegram) {
    console.error('TELEGRAM_BOT_TOKEN is not set in .env.local');
    process.exit(1);
  }
  if (!telegram.chatId) {
    console.error('TELEGRAM_CHAT_ID is not set in .env.local');
    process.exit(1);
  }

  const { respondTo } = await import('../lib/telegram/commands');
  const { announce } = await import('../lib/telegram/client');

  // Git Bash rewrites a leading slash into a Windows path, so accept both
  // "/table" and "table".
  const raw = (process.argv[2] ?? 'table').split(/[\/]/).pop() ?? 'table';
  const command = `/${raw}`;
  const message = await respondTo(command);

  if (!message) {
    console.error(`"${command}" is not a command the bot answers.`);
    process.exit(1);
  }

  console.log(`--- ${command} ---\n${message}\n---`);
  console.log(await announce(message) ? 'Sent.' : 'Failed — see the error above.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
