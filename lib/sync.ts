/**
 * Reference-data sync: gameweeks and league membership.
 *
 * Both operations are idempotent — safe to run on every poll, which
 * is exactly what the hourly cron does. Scoring is deliberately NOT here; it
 * gates on `data_checked` and lands in the poller.
 */
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import { getConfig } from './config';
import { getDb } from './db';
import { gameweeks, league, managers } from './db/schema';
import { fetchEvents, fetchLeagueRoster } from './fpl/client';
import { joinedGameweek, monthKeyOf } from './scoring/month';

export interface SyncResult {
  gameweeks: number;
  members: number;
  leagueName: string;
  /** Members who have left the league since the last sync. */
  deactivated: number;
  /** Why the gameweeks are stale, when bootstrap could not be fetched. */
  degraded: string | null;
}

/** Mirrors bootstrap-static's 38 events, assigning each to a calendar month. */
export async function syncGameweeks() {
  const cfg = getConfig();
  const db = getDb();
  const events = await fetchEvents();

  const rows = events.map((e) => ({
    event: e.id,
    deadlineTime: new Date(e.deadline_time),
    monthKey: monthKeyOf(e.deadline_time, cfg.rules.timezone),
    finished: e.finished,
    dataChecked: e.data_checked,
    averageEntryScore: e.average_entry_score ?? 0,
  }));

  await db
    .insert(gameweeks)
    .values(rows)
    .onConflictDoUpdate({
      target: gameweeks.event,
      set: {
        deadlineTime: sql`excluded.deadline_time`,
        monthKey: sql`excluded.month_key`,
        finished: sql`excluded.finished`,
        dataChecked: sql`excluded.data_checked`,
        averageEntryScore: sql`excluded.average_entry_score`,
      },
    });

  return rows;
}

/**
 * Mirrors the league roster.
 *
 * `joined_gw` and `joined_time` are written once and never overwritten —
 * `joined_time` only exists while a manager is unranked, so a later poll would
 * otherwise clear it and silently change which gameweeks count for them.
 */
export async function syncMembers(deadlines: { event: number; deadlineTime: Date }[]) {
  const cfg = getConfig();
  const db = getDb();
  const roster = await fetchLeagueRoster();

  await db
    .insert(league)
    .values({ id: cfg.leagueId, name: roster.leagueName, startEvent: roster.startEvent })
    .onConflictDoUpdate({
      target: league.id,
      set: {
        name: sql`excluded.name`,
        startEvent: sql`excluded.start_event`,
        syncedAt: sql`now()`,
      },
    });

  // An empty roster is never taken as "everybody left" — before the first
  // deadline the API can legitimately return nothing, and deactivating the
  // whole league on one odd response is not a recoverable mistake.
  if (roster.members.length === 0) {
    return { leagueName: roster.leagueName, count: 0, deactivated: 0 };
  }

  const rows = roster.members.map((m) => ({
    entryId: m.entryId,
    entryName: m.entryName,
    playerName: m.playerName,
    joinedGw: joinedGameweek(m.joinedTime, deadlines) ?? deadlines.at(-1)?.event ?? 1,
    joinedTime: m.joinedTime,
    active: true,
  }));

  await db
    .insert(managers)
    .values(rows)
    .onConflictDoUpdate({
      target: managers.entryId,
      set: {
        // Names can change at any time; joining facts cannot.
        entryName: sql`excluded.entry_name`,
        playerName: sql`excluded.player_name`,
        active: sql`true`,
        joinedTime: sql`coalesce(${managers.joinedTime}, excluded.joined_time)`,
      },
    });

  // Anyone absent from the roster has left, so stop counting them. Their rows
  // are kept: a gameweek they won stays won. The roster is fully paginated and
  // a failed fetch throws long before this, so absence here is real.
  //
  // This also covers pointing an existing database at a different league,
  // though a fresh database is the better answer — see the README.
  const deactivated = await db
    .update(managers)
    .set({ active: false })
    .where(
      and(
        eq(managers.active, true),
        notInArray(
          managers.entryId,
          rows.map((r) => r.entryId),
        ),
      ),
    )
    .returning({ entryId: managers.entryId });

  return { leagueName: roster.leagueName, count: rows.length, deactivated: deactivated.length };
}

/** Everything that is safe to refresh regardless of gameweek state. */
export async function syncReferenceData(): Promise<SyncResult> {
  const db = getDb();
  let events: { event: number; deadlineTime: Date }[];
  let degraded: string | null = null;

  try {
    events = await syncGameweeks();
  } catch (error) {
    // bootstrap-static is 1.4MB and cached only in memory, so a cold start
    // refetches it — which makes it the request most likely to be refused by
    // FPL's CDN, and losing it would otherwise fail an entire run.
    //
    // The stored gameweeks are all this needs. Only `data_checked` goes stale,
    // and the next run re-reads it minutes later; the poller asks what is
    // outstanding rather than what changed, so nothing is missed.
    const stored = await db
      .select({ event: gameweeks.event, deadlineTime: gameweeks.deadlineTime })
      .from(gameweeks)
      .orderBy(asc(gameweeks.event));

    if (stored.length === 0) throw error;

    events = stored;
    degraded = error instanceof Error ? error.message : String(error);
  }

  const { leagueName, count, deactivated } = await syncMembers(events);
  return { gameweeks: events.length, members: count, leagueName, deactivated, degraded };
}
