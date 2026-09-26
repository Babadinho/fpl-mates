/**
 * Which season a row belongs to, as the year it opened: 2026 for 2026/27.
 *
 * Nothing in FPL's API says which season it is. Gameweeks are numbered 1 to
 * 38 every year, entry histories reset every August, and the only field that
 * carries a year is a deadline. So the season is read off the opening
 * gameweek's deadline — always in August, so the year is unambiguous in any
 * timezone — and stamped on every row that would otherwise collide with last
 * year's.
 */
import { max } from 'drizzle-orm';
import { getDb } from './db';
import { gameweeks } from './db/schema';

/**
 * The season a deadline opens. Only ever given Gameweek 1's: a January
 * deadline belongs to the season that opened the previous August, and this
 * would say otherwise.
 */
export function seasonOf(openingDeadline: Date | string): number {
  return new Date(openingDeadline).getUTCFullYear();
}

/** "2026/27" */
export function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, '0')}`;
}

/** The newest season synced, which is the one in play. Null before the first sync. */
export async function currentSeason(): Promise<number | null> {
  const [row] = await getDb().select({ season: max(gameweeks.season) }).from(gameweeks);
  return row?.season ?? null;
}
