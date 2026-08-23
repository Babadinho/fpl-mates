/**
 * The poller: the only thing that writes scores.
 *
 * Run hourly during the season. Almost every run does nothing — it checks
 * whether a gameweek has settled and exits. Work happens roughly once a week,
 * when `data_checked` flips on a gameweek that has not been processed.
 *
 * Three properties matter more than anything else here:
 *
 *   1. It gates on `data_checked`, never `finished`. Bonus points
 *      settle an hour or more after the final whistle, and stat corrections
 *      land days later. Declaring a winner early means retracting one.
 *   2. It is idempotent. Every write is an upsert, and a gameweek
 *      is only considered while `processed_at` is null. Re-running is a no-op.
 *   3. It is self-healing. It asks "which settled gameweeks are unprocessed?",
 *      not "what happened since last time", so a missed run — an outage, a
 *      failed deploy — is picked up by the next one with no special path and
 *      no separate backfill script.
 */
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { getConfig } from './config';
import { getDb } from './db';
import { gameweeks, gwScores, managers, monthlyWinners, pollRuns, weeklyWinners } from './db/schema';
import { fetchEntryHistory, mapWithConcurrency } from './fpl/client';
import { CHIP_LABELS, type FplHistoryEntry } from './fpl/schemas';
import { warmPicks } from './live';
import { settleEntries } from './settle';
import { declareWinner, monthlyTable, pointsAfterCost, weeklyTable, type ManagerRef, type ScoreRow } from './scoring/tables';
import { syncReferenceData } from './sync';
import { announce } from './telegram/client';
import { formatSettled } from './telegram/format';
import { getLeaderboardView } from './view';

export interface PollResult {
  outcome: 'ok' | 'skipped' | 'error';
  detail: string;
  /** Gameweeks processed by this run. Empty on a no-op. */
  processed: number[];
  durationMs: number;
}

/** One manager's full season history, fetched once per run. */
export interface ManagerHistory {
  manager: ManagerRef;
  byEvent: Map<number, FplHistoryEntry>;
  /** Gameweek → chip badge (FH / BB / TC / WC). */
  chips: Map<number, string>;
}

/**
 * Fetches every member's history once.
 *
 * A single call returns a manager's whole season, so this is per-run rather
 * than per-gameweek — processing three pending gameweeks costs the same
 * requests as processing one.
 */
async function fetchHistories(roster: ManagerRef[]): Promise<ManagerHistory[]> {
  const { fpl } = getConfig();

  return mapWithConcurrency(roster, fpl.concurrency, async (manager) => {
    const history = await fetchEntryHistory(manager.entryId);

    return {
      manager,
      byEvent: new Map(history.current.map((entry) => [entry.event, entry])),
      chips: new Map(
        history.chips.map((chip) => [chip.event, CHIP_LABELS[chip.name] ?? chip.name.toUpperCase()]),
      ),
    };
  });
}

/** Turns one gameweek's slice of the histories into rows ready to store. Exported for tests. */
export function rowsForEvent(histories: ManagerHistory[], event: number): ScoreRow[] {
  const rows: ScoreRow[] = [];

  for (const { manager, byEvent, chips } of histories) {
    const entry = byEvent.get(event);
    // No entry means they were not playing FPL that gameweek. That is normal
    // for someone who registered late, and is not the same as a zero.
    if (!entry) continue;

    rows.push({
      entryId: manager.entryId,
      event,
      grossPoints: entry.points,
      transferCost: entry.event_transfers_cost,
      pointsOnBench: entry.points_on_bench,
      overallRank: entry.overall_rank,
      chipUsed: chips.get(event) ?? null,
    });
  }

  return rows;
}

/**
 * Runs the poll.
 *
 * Returns rather than throws, so the route can always answer and the run is
 * always recorded in `poll_runs`.
 */
export async function runPoll(): Promise<PollResult> {
  const startedAt = Date.now();
  const cfg = getConfig();
  const db = getDb();

  const [run] = await db.insert(pollRuns).values({}).returning({ id: pollRuns.id });

  const finish = async (result: Omit<PollResult, 'durationMs'>): Promise<PollResult> => {
    const durationMs = Date.now() - startedAt;
    await db
      .update(pollRuns)
      .set({ finishedAt: new Date(), outcome: result.outcome, detail: result.detail })
      .where(eq(pollRuns.id, run.id));
    return { ...result, durationMs };
  };

  try {
    // Cheap and idempotent, so it runs every time: picks up new members and
    // any change to deadlines or the data_checked flags.
    const sync = await syncReferenceData();
    // Recorded rather than raised: the run went ahead on stored gameweeks, and
    // a failure people are trained to ignore is worse than none at all.
    const stale = sync.degraded ? ` (gameweeks stale: ${sync.degraded})` : '';

    await warmPicksForKickedOffGameweek();

    const pending = await db
      .select()
      .from(gameweeks)
      .where(and(eq(gameweeks.dataChecked, true), isNull(gameweeks.processedAt)))
      .orderBy(asc(gameweeks.event));

    if (pending.length === 0) {
      return finish({
        outcome: 'skipped',
        detail: `no settled gameweeks awaiting processing${stale}`,
        processed: [],
      });
    }

    const roster = await db.select().from(managers).where(eq(managers.active, true));
    if (roster.length === 0) {
      return finish({
        outcome: 'skipped',
        detail: `league has no members yet${stale}`,
        processed: [],
      });
    }

    const refs: ManagerRef[] = roster.map((m) => ({
      entryId: m.entryId,
      playerName: m.playerName,
      entryName: m.entryName,
      joinedGw: m.joinedGw,
    }));

    const histories = await fetchHistories(refs);
    const options = {
      countPrejoinGws: cfg.rules.countPrejoinGws,
      tiebreakOrder: cfg.rules.tiebreakOrder,
    };
    const processed: number[] = [];
    /** Settled long ago but containing no member data — closed out, no winner. */
    const empty: number[] = [];

    for (const week of pending) {
      const rows = rowsForEvent(histories, week.event);

      if (rows.length === 0) {
        // A failed fetch throws and aborts the run, so reaching here means the
        // histories came back cleanly and genuinely contain nothing for this
        // gameweek — normal when every member registered with FPL after it.
        //
        // Retrying that forever would refetch every history hourly to re-learn
        // the same thing, so allow a day for late-arriving data and then close
        // the gameweek out with no winner. Before that, leave it for the next
        // run in case this is a race against the data appearing.
        const settledLongAgo =
          Date.now() - week.deadlineTime.getTime() > 24 * 60 * 60 * 1000;

        if (settledLongAgo) {
          await db
            .update(gameweeks)
            .set({ processedAt: new Date() })
            .where(eq(gameweeks.event, week.event));
          empty.push(week.event);
        }
        continue;
      }

      // How much of each score was bonus. Only knowable by joining the live
      // feed to the picks, so it is worked out here once and stored — a table
      // rendered in May must not refetch a gameweek played in August.
      //
      // Never fatal: a gameweek with no bonus breakdown is still correctly
      // scored, and blocking settlement on it would hold up the winner.
      let bonusOf = new Map<number, number>();
      try {
        const settled = await settleEntries(
          rows.map((r) => r.entryId),
          week.event,
        );
        bonusOf = new Map(settled.map((s) => [s.entryId, s.bonus]));
      } catch {
        bonusOf = new Map();
      }

      await db
        .insert(gwScores)
        .values(
          rows.map((row) => ({
            entryId: row.entryId,
            event: row.event,
            grossPoints: row.grossPoints,
            transferCost: row.transferCost,
            points: pointsAfterCost(row),
            pointsOnBench: row.pointsOnBench,
            bonus: bonusOf.get(row.entryId) ?? 0,
            overallRank: row.overallRank,
            chipUsed: row.chipUsed,
          })),
        )
        .onConflictDoUpdate({
          target: [gwScores.entryId, gwScores.event],
          set: {
            grossPoints: sql`excluded.gross_points`,
            transferCost: sql`excluded.transfer_cost`,
            points: sql`excluded.points`,
            pointsOnBench: sql`excluded.points_on_bench`,
            // Keeps a stored figure when a reprocess could not fetch one.
            bonus: sql`greatest(excluded.bonus, ${gwScores.bonus})`,
            overallRank: sql`excluded.overall_rank`,
            chipUsed: sql`excluded.chip_used`,
            fetchedAt: sql`now()`,
          },
        });

      // ---- weekly winner
      const weekWinner = declareWinner(
        weeklyTable(rows, refs, week.event, options),
        cfg.rules.tiebreakOrder,
      );

      if (weekWinner) {
        await db
          .insert(weeklyWinners)
          .values({
            event: week.event,
            entryId: weekWinner.entryId,
            points: weekWinner.points,
            tiedWith: weekWinner.tiedWith,
            decidedBy: weekWinner.decidedBy,
          })
          .onConflictDoUpdate({
            target: weeklyWinners.event,
            set: {
              entryId: sql`excluded.entry_id`,
              points: sql`excluded.points`,
              tiedWith: sql`excluded.tied_with`,
              decidedBy: sql`excluded.decided_by`,
            },
          });
      }

      await db
        .update(gameweeks)
        .set({ processedAt: new Date() })
        .where(eq(gameweeks.event, week.event));

      processed.push(week.event);

      // ---- monthly winner, only once every gameweek in the month has settled
      await declareMonthIfComplete(week.monthKey, refs, options);
    }

    // A first run backfills the whole season at once, and so does a rebuilt
    // database. Announcing each gameweek would post a dozen messages seconds
    // apart — so only the newest is sent, and the rest are marked as posted
    // without sending. In normal weekly operation there is only ever one.
    if (processed.length > 1) {
      await db
        .update(weeklyWinners)
        .set({ postedAt: new Date() })
        .where(
          and(inArray(weeklyWinners.event, processed.slice(0, -1)), isNull(weeklyWinners.postedAt)),
        );
    }
    if (processed.length > 0) {
      await announceSettled(processed[processed.length - 1]);
    }

    const detail = [
      processed.length ? `processed ${processed.join(', ')}` : 'processed nothing',
      empty.length ? `no data for ${empty.join(', ')}, closed out` : '',
    ]
      .filter(Boolean)
      .join('; ');

    return finish({ outcome: 'ok', detail, processed });
  } catch (error) {
    return finish({
      outcome: 'error',
      detail: error instanceof Error ? error.message : String(error),
      processed: [],
    });
  }
}

/**
 * Caches every manager's picks as soon as a gameweek kicks off.
 *
 * Picks are frozen at the deadline, so this is a one-off per gameweek that the
 * live table would otherwise pay on its first page render — one request per
 * manager, inside a single request, against a page timeout far shorter than
 * the poller's.
 *
 * Deliberately not fatal: a warm cache is an optimisation, and failing here
 * must not stop a gameweek being scored. The live table still fills its own
 * cache on demand, exactly as before.
 */
async function warmPicksForKickedOffGameweek(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.live.enabled) return;

  const db = getDb();
  const [next] = await db
    .select()
    .from(gameweeks)
    .where(and(eq(gameweeks.dataChecked, false), lte(gameweeks.deadlineTime, new Date())))
    .orderBy(asc(gameweeks.event))
    .limit(1);

  if (!next) return;

  try {
    await warmPicks(next.event);
  } catch {
    // Logged by nothing on purpose: the next run retries, and the page still works.
  }
}

/**
 * Posts a settled gameweek to Telegram, once.
 *
 * Guarded by weekly_winners.posted_at rather than by the caller, so a re-run
 * that reprocesses a gameweek still cannot repost it.
 */
async function announceSettled(event: number) {
  const db = getDb();

  const [row] = await db
    .select({ postedAt: weeklyWinners.postedAt })
    .from(weeklyWinners)
    .where(eq(weeklyWinners.event, event))
    .limit(1);

  if (!row || row.postedAt) return;

  const message = formatSettled(await getLeaderboardView(), event);
  if (!message) return;

  if (await announce(message)) {
    await db
      .update(weeklyWinners)
      .set({ postedAt: new Date() })
      .where(eq(weeklyWinners.event, event));
  }
}

/**
 * Declares a monthly winner once every gameweek belonging to that month is
 * settled.
 *
 * Months hold unequal numbers of gameweeks — two in August, six in December —
 * so completeness is "no unchecked gameweeks share this month key", not a count.
 */
async function declareMonthIfComplete(
  monthKey: string,
  refs: ManagerRef[],
  options: { countPrejoinGws: boolean; tiebreakOrder: readonly import('./config').TiebreakKey[] },
) {
  const db = getDb();

  const weeks = await db.select().from(gameweeks).where(eq(gameweeks.monthKey, monthKey));
  if (weeks.some((w) => !w.dataChecked)) return;

  const events = weeks.map((w) => w.event);
  const stored = await db.select().from(gwScores);
  const rows: ScoreRow[] = stored
    .filter((s) => events.includes(s.event))
    .map((s) => ({
      entryId: s.entryId,
      event: s.event,
      grossPoints: s.grossPoints,
      transferCost: s.transferCost,
      pointsOnBench: s.pointsOnBench,
      overallRank: s.overallRank,
      chipUsed: s.chipUsed,
    }));

  const winner = declareWinner(monthlyTable(rows, refs, events, options), options.tiebreakOrder);
  if (!winner) return;

  await db
    .insert(monthlyWinners)
    .values({
      monthKey,
      entryId: winner.entryId,
      totalPoints: winner.points,
      gameweekCount: events.length,
      tiedWith: winner.tiedWith,
      decidedBy: winner.decidedBy,
    })
    .onConflictDoUpdate({
      target: monthlyWinners.monthKey,
      set: {
        entryId: sql`excluded.entry_id`,
        totalPoints: sql`excluded.total_points`,
        gameweekCount: sql`excluded.gameweek_count`,
        tiedWith: sql`excluded.tied_with`,
        decidedBy: sql`excluded.decided_by`,
      },
    });
}
