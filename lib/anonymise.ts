/**
 * Stand-in names, for running a public demo off a real league.
 *
 * Everything else about the page stays real — live scores, the gameweek FPL is
 * actually on, substitutions, fixtures — which is the whole point: the checked
 * in fixtures disable live scoring entirely, so a demo built on them cannot
 * show the half of the app worth showing. This swaps the only part that cannot
 * be published, which is who these people are.
 *
 * A pure function of the entry id, so a manager keeps the same stand-in across
 * every render, gameweek and table, and the squad panel agrees with the row
 * that opened it. That rules out guaranteeing uniqueness — assigning names
 * without collisions needs to see the whole league at once — so the name space
 * is built large enough that a repeat in a league of a thousand is about as
 * likely as two real people sharing a name, which is to say it happens and
 * nobody notices.
 */
import { getConfig } from './config';

/** FNV-1a over the digits, to spread entry ids registered minutes apart. */
function hash(value: number): number {
  let h = 0x811c9dc5;
  for (const ch of String(value)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * One well-mixed draw per part of the name.
 *
 * Salting the hash itself was not enough: for small salts the draws stayed
 * correlated, the parts moved together, and a league of a thousand came out
 * 14% duplicates. Mixing each draw separately is what makes them independent.
 */
function draw(entryId: number, n: number): number {
  let h = (hash(entryId) + Math.imul(n, 0x9e3779b9)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x21f0aaad);
  h ^= h >>> 15;
  h = Math.imul(h, 0x735a2d97);
  h ^= h >>> 15;
  return h >>> 0;
}

const pick = <T>(list: readonly T[], entryId: number, n: number): T =>
  list[draw(entryId, n) % list.length];

const FIRST = [
  'Adam', 'Adaeze', 'Ade', 'Amara', 'Ben', 'Blessing', 'Callum', 'Chidi',
  'Chioma', 'Daniel', 'Dele', 'Ebube', 'Ellis', 'Emeka', 'Esther', 'Femi',
  'Finn', 'Gbenga', 'George', 'Grace', 'Hassan', 'Hope', 'Ibrahim', 'Ife',
  'Isla', 'Jamal', 'Joy', 'Kaira', 'Kemi', 'Kwame', 'Lanre', 'Leo',
  'Lola', 'Marcus', 'Mide', 'Musa', 'Nadia', 'Ngozi', 'Noah', 'Obi',
  'Olu', 'Oscar', 'Priya', 'Rafa', 'Rita', 'Rosa', 'Sam', 'Segun',
  'Seun', 'Simi', 'Tari', 'Theo', 'Tobi', 'Uche', 'Vera', 'Wale',
  'Yemi', 'Yusuf', 'Zane', 'Zara',
] as const;

/** Surnames are built from two halves, which is what makes the space big. */
const STEM = [
  'Ash', 'Bram', 'Cald', 'Dun', 'East', 'Fair', 'Gold', 'Hart', 'Ing', 'Kend',
  'Lang', 'Mar', 'Nor', 'Old', 'Pem', 'Quill', 'Rad', 'Shel', 'Thorn', 'Under',
  'Van', 'Wake', 'Whit', 'Yard', 'Bal', 'Cress', 'Dray', 'Fen', 'Gar', 'Hol',
] as const;

const TAIL = [
  'bury', 'combe', 'den', 'field', 'ford', 'gate', 'ham', 'hurst', 'ley', 'low',
  'mere', 'more', 'ridge', 'stone', 'ton', 'vale', 'wood', 'worth', 'shaw', 'by',
  'croft', 'dale', 'holme', 'thorpe', 'wick', 'brook',
] as const;

const TEAM_FIRST = [
  'Athletic', 'Bench', 'Boot', 'Corner', 'Deadline', 'Dugout', 'Extra', 'Final',
  'Free', 'Golden', 'Injury', 'Offside', 'Penalty', 'Pitch', 'Set', 'Silly',
  'Sunday', 'Touchline', 'Transfer', 'Wildcard',
] as const;

const TEAM_SECOND = [
  'Alliance', 'Athletic', 'Brigade', 'Committee', 'Dynamo', 'Endeavour', 'FC',
  'Gunners', 'Hopefuls', 'Invincibles', 'Legion', 'Mavericks', 'Nomads',
  'Optimists', 'Rangers', 'Rovers', 'Select', 'Titans', 'United', 'Wanderers',
] as const;

/** The stand-in for one manager. Exported for the tests, and pure. */
export function pseudonym(entryId: number): { playerName: string; entryName: string } {
  return {
    playerName: `${pick(FIRST, entryId, 1)} ${pick(STEM, entryId, 2)}${pick(TAIL, entryId, 3)}`,
    entryName: `${pick(TEAM_FIRST, entryId, 4)} ${pick(TEAM_SECOND, entryId, 5)}`,
  };
}

interface Named {
  entryId: number;
  playerName: string;
  entryName: string;
}

/**
 * Replaces real names with stand-ins when ANONYMISE_MANAGERS is on.
 *
 * Applied where manager rows are read out of Postgres, so everything
 * downstream — tables, hero, squad panel, share card, Telegram — inherits it
 * without knowing. What is stored is untouched: the poller keeps writing real
 * rows, and turning the flag off shows the real league again.
 */
export function maskManagers<T extends Named>(managers: T[]): T[] {
  if (!getConfig().site.anonymiseManagers) return managers;
  return managers.map((m) => ({ ...m, ...pseudonym(m.entryId) }));
}
