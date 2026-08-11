import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env.local on its own.
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

/**
 * Migrations run over the DIRECT connection — drizzle-kit needs a session-level
 * connection and fails over a pooler. `pnpm db:*` loads .env.local via --env-file.
 */
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
