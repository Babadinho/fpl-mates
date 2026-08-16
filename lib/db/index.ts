import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { getConfig } from '../config';
import * as schema from './schema';

let cached: ReturnType<typeof create> | undefined;

function create() {
  const { url } = getConfig().db;

  // Empty only under USE_FIXTURES, where nothing should reach the database.
  // Saying so beats whatever the driver reports for an empty connection string.
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. USE_FIXTURES renders the demo league without a ' +
        'database, so nothing should be querying one — unset it, or set DATABASE_URL.',
    );
  }

  return drizzle(neon(url), { schema, casing: 'snake_case' });
}

/** Lazily built so importing this module never requires a configured env. */
export function getDb() {
  return (cached ??= create());
}

export { schema };
