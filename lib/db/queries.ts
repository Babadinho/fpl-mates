import { asc, eq } from 'drizzle-orm';
import { getConfig } from '../config';
import { getDb } from './index';
import { gameweeks, league, managers } from './schema';

export interface SeasonState {
  leagueName: string;
  seasonLabel: string;
  /** Null before GW1 settles — nothing has been scored yet. */
  lastSettled: { event: number; monthKey: string } | null;
  /** The next gameweek with a deadline in the future. */
  nextDeadline: { event: number; deadlineTime: Date } | null;
  members: { entryId: number; playerName: string; entryName: string; joinedGw: number }[];
  totalGameweeks: number;
}

/** "2026/27", derived from the first and last deadline unless SEASON_LABEL is set. */
function deriveSeasonLabel(first: Date, last: Date, override?: string): string {
  if (override) return override;
  const startYear = first.getUTCFullYear();
  const endYear = last.getUTCFullYear();
  return endYear > startYear ? `${startYear}/${String(endYear).slice(-2)}` : String(startYear);
}

/**
 * Everything the page header needs, read from Postgres only. The page never
 * calls the FPL API at request time — that is what keeps it fast and sidesteps
 * CORS and rate limits entirely (section 5b).
 */
export async function getSeasonState(): Promise<SeasonState> {
  const cfg = getConfig();
  const db = getDb();

  const [weeks, roster, leagueRows] = await Promise.all([
    db.select().from(gameweeks).orderBy(asc(gameweeks.event)),
    db.select().from(managers).where(eq(managers.active, true)).orderBy(asc(managers.playerName)),
    db.select().from(league).where(eq(league.id, cfg.leagueId)).limit(1),
  ]);

  const settled = weeks.filter((w) => w.dataChecked);
  const now = Date.now();
  const upcoming = weeks.find((w) => w.deadlineTime.getTime() > now);
  const last = settled.at(-1);

  return {
    // LEAGUE_DISPLAY_NAME wins; otherwise the real name FPL returns.
    leagueName: cfg.site.leagueName ?? leagueRows[0]?.name ?? 'FPL Gaffer',
    seasonLabel: deriveSeasonLabel(
      weeks[0]?.deadlineTime ?? new Date(),
      weeks.at(-1)?.deadlineTime ?? new Date(),
      cfg.site.seasonLabel,
    ),
    lastSettled: last ? { event: last.event, monthKey: last.monthKey } : null,
    nextDeadline: upcoming ? { event: upcoming.event, deadlineTime: upcoming.deadlineTime } : null,
    members: roster.map((m) => ({
      entryId: m.entryId,
      playerName: m.playerName,
      entryName: m.entryName,
      joinedGw: m.joinedGw,
    })),
    totalGameweeks: weeks.length,
  };
}
