import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { getConfig } from '../config';
import * as schema from './schema';

let cached: ReturnType<typeof create> | undefined;

function create() {
  return drizzle(neon(getConfig().db.url), { schema, casing: 'snake_case' });
}

/** Lazily built so importing this module never requires a configured env. */
export function getDb() {
  return (cached ??= create());
}

export { schema };
