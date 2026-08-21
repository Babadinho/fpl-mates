/**
 * Live, provisional scoring for a gameweek in play.
 *
 * Deliberately separate from the poller. The poller is the authority: it waits
 * for `data_checked`, writes `gw_scores` and declares winners. Nothing here is
 * ever stored as a result or used to declare anything — it exists so people can
 * watch their score move on a Saturday afternoon.
 *
 * Cost per refresh, regardless of league size:
 *   1 request  fixtures/?event=N
 *   1 request  event/N/live/
 *   0 requests picks — frozen at the deadline, cached in Postgres
 *
 * Picks cost one request per manager, once per gameweek.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getConfig } from './config';
import { getDb } from './db';
import { entryPicks, gameweeks, managers } from './db/schema';
import { fetchBootstrap, fetchEntryPicks, fetchFixtures, fetchLiveEvent, mapWithConcurrency } from './fpl/client';
import { CHIP_LABELS } from './fpl/schemas';
import { provisionalBonusByElement, type FixtureBps } from './scoring/bonus';
import type { ManagerRef, ScoreRow } from './scoring/tables';

export interface LiveFixture {
  id: number;
  home: string;
  away: string;
  /** "2 – 0" once started, otherwise the kickoff time. */
  score: string;
  /** "45'", "FT", or empty before kickoff. */
  clock: string;
  /** ISO kickoff, for counting down to it on the client. */
  kickoff: string | null;
  started: boolean;
  finished: boolean;
}

export interface LiveState {
  event: number;
  /** When the FPL data behind this was actually fetched. */
  fetchedAt: Date;
  fixtures: LiveFixture[];
  started: number;
  finished: number;
  total: number;
  /** True while at least one fixture is under way. */
  inPlay: boolean;
  /** Provisional rows, shaped like stored scores so the same tables work. */
  rows: ScoreRow[];
  /** Provisional bonus per manager, shown in its own column. */
  provisionalBonus: Map<number, number>;
}

/** Ensures every manager's picks for this gameweek are cached, then returns them. */
async function loadPicks(refs: ManagerRef[], event: number) {
  const cfg = getConfig();
  const db = getDb();

  const cached = await db
    .select()
    .from(entryPicks)
    .where(
      and(
        eq(entryPicks.event, event),
        inArray(
          entryPicks.entryId,
          refs.map((r) => r.entryId),
        ),
      ),
    );

  const have = new Set(cached.map((p) => p.entryId));
  const missing = refs.filter((r) => !have.has(r.entryId));

  if (missing.length > 0) {
    // One request each, once per gameweek — picks cannot change after the
    // deadline, so this never repeats within a gameweek.
    const fetched = await mapWithConcurrency(missing, cfg.fpl.concurrency, async (manager) => {
      const picks = await fetchEntryPicks(manager.entryId, event);

      // `position` is the pick slot, 1–15. Null when the flag is absent, which
      // the schema tolerates because no response has confirmed it exists.
      const slotOf = (match: (p: (typeof picks.picks)[number]) => boolean) =>
        picks.picks.find(match)?.position ?? null;

      return {
        entryId: manager.entryId,
        event,
        elementIds: picks.picks.map((p) => p.element),
        multipliers: picks.picks.map((p) => p.multiplier),
        captainIndex: slotOf((p) => p.is_captain),
        viceIndex: slotOf((p) => p.is_vice_captain),
        activeChip: picks.active_chip,
        transferCost: picks.entry_history.event_transfers_cost,
      };
    });

    if (fetched.length > 0) {
      await db.insert(entryPicks).values(fetched).onConflictDoNothing();
      cached.push(...fetched.map((f) => ({ ...f, fetchedAt: new Date() })));
    }
  }

  return cached;
}

function formatKickoff(iso: string | null, timezone: string): string {
  if (!iso) return 'TBC';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Builds the live picture for a gameweek.
 *
 * Returns null when nothing has kicked off — there is no live table to show
 * before the first whistle, only a fixture list.
 */
export async function getLiveState(event: number): Promise<LiveState | null> {
  const cfg = getConfig();
  const db = getDb();

  const [bootstrap, fixtures, live] = await Promise.all([
    fetchBootstrap(),
    fetchFixtures(event),
    fetchLiveEvent(event),
  ]);
  const fetchedAt = new Date();

  const teamName = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const elementTeam = new Map(bootstrap.elements.map((e) => [e.id, e.team]));
  const stats = new Map(live.elements.map((e) => [e.id, e.stats]));

  const grid: LiveFixture[] = fixtures.map((f) => ({
    id: f.id,
    home: teamName.get(f.team_h) ?? '???',
    away: teamName.get(f.team_a) ?? '???',
    score:
      f.started && f.team_h_score !== null && f.team_a_score !== null
        ? `${f.team_h_score} – ${f.team_a_score}`
        : formatKickoff(f.kickoff_time, cfg.rules.timezone),
    clock: f.finished ? 'FT' : f.started ? `${f.minutes}'` : '',
    kickoff: f.kickoff_time,
    started: f.started,
    finished: f.finished,
  }));

  const started = fixtures.filter((f) => f.started).length;
  const finished = fixtures.filter((f) => f.finished).length;

  // Before the deadline there is nothing to show: squads are still being
  // edited, so a table would rank teams nobody has committed to. After it,
  // every other FPL app shows the gameweek at zero — picks are frozen, and a
  // level table is the honest state of play.
  const [week] = await db
    .select({ deadline: gameweeks.deadlineTime })
    .from(gameweeks)
    .where(eq(gameweeks.event, event))
    .limit(1);
  const locked = week !== undefined && week.deadline.getTime() <= fetchedAt.getTime();

  if (started === 0 && !locked) {
    return {
      event,
      fetchedAt,
      fixtures: grid,
      started,
      finished,
      total: fixtures.length,
      inPlay: false,
      rows: [],
      provisionalBonus: new Map(),
    };
  }

  // ---- provisional bonus, per fixture, from live BPS
  const bpsByFixture: FixtureBps[] = fixtures
    .filter((f) => f.started)
    .map((f) => {
      const entries = live.elements
        .filter((e) => {
          const team = elementTeam.get(e.id);
          return team === f.team_h || team === f.team_a;
        })
        .map((e) => ({ elementId: e.id, bps: e.stats.bps }));

      // Once FPL has awarded real bonus it is already inside total_points.
      const bonusAwarded = entries.some((e) => (stats.get(e.elementId)?.bonus ?? 0) > 0);
      return { fixtureId: f.id, bonusAwarded, entries };
    });

  const bonusByElement = provisionalBonusByElement(bpsByFixture);

  // ---- manager scores
  const roster = await db.select().from(managers).where(eq(managers.active, true));
  const refs: ManagerRef[] = roster.map((m) => ({
    entryId: m.entryId,
    playerName: m.playerName,
    entryName: m.entryName,
    joinedGw: m.joinedGw,
  }));

  const picks = await loadPicks(refs, event);
  const rows: ScoreRow[] = [];
  const provisionalBonus = new Map<number, number>();

  for (const entry of picks) {
    let points = 0;
    let bonus = 0;

    entry.elementIds.forEach((elementId, index) => {
      const multiplier = entry.multipliers[index] ?? 0;
      // Auto-substitutions are only applied when the gameweek ends, so a live
      // table counts the starting XI exactly as picked.
      if (multiplier === 0) return;

      points += (stats.get(elementId)?.total_points ?? 0) * multiplier;
      const provisional = (bonusByElement.get(elementId) ?? 0) * multiplier;
      points += provisional;
      bonus += provisional;
    });

    rows.push({
      entryId: entry.entryId,
      event,
      grossPoints: points,
      transferCost: entry.transferCost,
      pointsOnBench: 0,
      overallRank: null,
      chipUsed: entry.activeChip ? (CHIP_LABELS[entry.activeChip] ?? null) : null,
    });
    provisionalBonus.set(entry.entryId, bonus);
  }

  return {
    event,
    fetchedAt,
    fixtures: grid,
    started,
    finished,
    total: fixtures.length,
    inPlay: started > finished,
    rows,
    provisionalBonus,
  };
}

/**
 * The gameweek currently worth showing live: the first one that has not
 * settled. Null once the season is over.
 */
/**
 * Fetches and caches picks for a gameweek that has kicked off, without scoring
 * anything.
 *
 * Called by the poller so the cold start is paid unattended, on a run with a
 * 60s budget. Otherwise it lands on whoever opens the page first after the
 * deadline: one request per manager inside a single render, which a small
 * league never notices and a 500-member league cannot survive.
 *
 * Returns how many were fetched — zero once the cache is warm, which is every
 * run after the first.
 */
export async function warmPicks(event: number): Promise<number> {
  const db = getDb();
  const roster = await db.select().from(managers).where(eq(managers.active, true));
  if (roster.length === 0) return 0;

  const before = await db
    .select({ entryId: entryPicks.entryId })
    .from(entryPicks)
    .where(eq(entryPicks.event, event));

  await loadPicks(
    roster.map((m) => ({
      entryId: m.entryId,
      playerName: m.playerName,
      entryName: m.entryName,
      joinedGw: m.joinedGw,
    })),
    event,
  );

  const after = await db
    .select({ entryId: entryPicks.entryId })
    .from(entryPicks)
    .where(eq(entryPicks.event, event));

  return after.length - before.length;
}

export async function liveGameweek(): Promise<{ event: number; deadline: Date } | null> {
  const db = getDb();
  const [next] = await db
    .select()
    .from(gameweeks)
    .where(eq(gameweeks.dataChecked, false))
    .orderBy(gameweeks.event)
    .limit(1);

  return next ? { event: next.event, deadline: next.deadlineTime } : null;
}
