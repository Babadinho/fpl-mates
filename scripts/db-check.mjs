// Verifies both Neon connection strings resolve and answer.
// Usage: pnpm db:check   (loads .env.local via --env-file)
import { neon } from '@neondatabase/serverless';

let failed = false;

for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
  const url = process.env[key];
  if (!url) {
    console.log(`${key}: not set${key === 'DATABASE_URL' ? ' — required' : ' — optional, migrations will use DATABASE_URL'}`);
    if (key === 'DATABASE_URL') failed = true;
    continue;
  }
  const pooled = new URL(url).hostname.includes('-pooler');
  try {
    const sql = neon(url);
    const t0 = Date.now();
    const [row] = await sql`select version() as v, current_database() as db`;
    console.log(`${key}: OK (${Date.now() - t0}ms) db=${row.db} pooled=${pooled}`);
    console.log(`  ${row.v.split(',')[0]}`);
  } catch (e) {
    console.log(`${key}: FAILED — ${e.message}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
