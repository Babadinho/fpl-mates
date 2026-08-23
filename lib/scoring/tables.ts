/**
 * Table building and winner declaration.
 *
 * Pure functions, no I/O — every scoring rule is testable
 * with a fixture array and no network. The same functions serve mock data now
 * and real rows from Postgres once GW1 settles.
 */
import type { TiebreakKey } from '../config';

/** One manager's raw result for one gameweek. Mirrors the gw_scores row. */
export interface ScoreRow {
  entryId: number;
  event: number;
  grossPoints: number;
  transferCost: number;
  pointsOnBench: number;
  /** Bonus inside grossPoints. Zero when it was never recorded. */
  bonus?: number;
  overallRank: number | null;
  chipUsed: string | null;
}

export interface ManagerRef {
  entryId: number;
  playerName: string;
  entryName: string;
  joinedGw: number;
}

/** An aggregated result over one or more gameweeks. */
export interface Aggregate {
  entryId: number;
  /** Gross minus transfer cost, summed. The number every table sorts on. */
  points: number;
  gross: number;
  /** Transfer points deducted, summed. Always positive. */
  hits: number;
  bench: number;
  /** Bonus inside `gross`, summed. */
  bonus: number;
  /** Most recent overall FPL rank in the range, or null. */
  overallRank: number | null;
  /** How many gameweeks contributed. */
  gameweeks: number;
  /** Highest single-gameweek score in the range, after costs. */
  best: number;
  /** Chip played — only meaningful over a single gameweek. */
  chip: string | null;
}

export interface RankedRow extends Aggregate {
  rank: number;
  manager: ManagerRef;
  /** True when this row shares its rank with another. */
  shared: boolean;
}

/**
 * A manager's score for a gameweek, AFTER transfer costs.
 *
 * Named explicitly rather than just `points`, because FPL's own `points` field
 * means the opposite — it is gross, before hits. A manager scoring 80 with a
 * -8 finishes below one scoring 74 clean; using gross is the single most
 * common bug in homemade FPL leaderboards.
 */
export function pointsAfterCost(row: Pick<ScoreRow, 'grossPoints' | 'transferCost'>): number {
  return row.grossPoints - row.transferCost;
}

/** Is this gameweek eligible for this manager? Mid-season joiners score
 *  only from the gameweek they joined, unless COUNT_PREJOIN_GWS is on. */
function counts(row: ScoreRow, manager: ManagerRef, countPrejoin: boolean): boolean {
  return countPrejoin || row.event >= manager.joinedGw;
}

/**
 * Folds raw rows into one aggregate per manager.
 *
 * `events` restricts the range; omit it for "everything so far".
 */
export function aggregate(
  rows: readonly ScoreRow[],
  managers: readonly ManagerRef[],
  options: { events?: readonly number[]; countPrejoinGws: boolean },
): Aggregate[] {
  const eventFilter = options.events ? new Set(options.events) : null;
  const byId = new Map(managers.map((m) => [m.entryId, m]));
  const totals = new Map<number, Aggregate>();

  // Every manager appears, even with no eligible gameweeks — a missing row is
  // indistinguishable from a zero otherwise, and that hides bugs.
  for (const m of managers) {
    totals.set(m.entryId, {
      entryId: m.entryId,
      points: 0,
      gross: 0,
      hits: 0,
      bench: 0,
      bonus: 0,
      overallRank: null,
      gameweeks: 0,
      best: 0,
      chip: null,
    });
  }

  const ordered = [...rows].sort((a, b) => a.event - b.event);

  for (const row of ordered) {
    const manager = byId.get(row.entryId);
    const acc = totals.get(row.entryId);
    if (!manager || !acc) continue;
    if (eventFilter && !eventFilter.has(row.event)) continue;
    if (!counts(row, manager, options.countPrejoinGws)) continue;

    const scored = pointsAfterCost(row);
    acc.points += scored;
    acc.gross += row.grossPoints;
    acc.hits += row.transferCost;
    acc.bench += row.pointsOnBench;
    acc.bonus += row.bonus ?? 0;
    acc.gameweeks += 1;
    acc.best = Math.max(acc.best, scored);
    // Rows are event-ordered, so the last write is the latest rank.
    if (row.overallRank !== null) acc.overallRank = row.overallRank;
    acc.chip = row.chipUsed ?? acc.chip;
  }

  return [...totals.values()];
}

/** Compares two aggregates on a single rule. Negative = `a` ranks higher. */
function applyRule(rule: TiebreakKey, a: Aggregate, b: Aggregate): number {
  switch (rule) {
    case 'points':
      return b.points - a.points;
    case 'hits':
      return a.hits - b.hits;
    case 'bench':
      return a.bench - b.bench;
    case 'overall_rank':
      // Null ranks sort last rather than winning by accident.
      if (a.overallRank === b.overallRank) return 0;
      if (a.overallRank === null) return 1;
      if (b.overallRank === null) return -1;
      return a.overallRank - b.overallRank;
  }
}

/** Builds a comparator from the configured rule order. */
export function comparator(order: readonly TiebreakKey[]) {
  return (a: Aggregate, b: Aggregate): number => {
    for (const rule of order) {
      const result = applyRule(rule, a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

/**
 * Sorts and assigns ranks.
 *
 * Managers who survive every configured rule share a rank — the last resort in
 * the default order is a declared shared win, not an arbitrary winner.
 */
export function rank(
  totals: readonly Aggregate[],
  managers: readonly ManagerRef[],
  order: readonly TiebreakKey[],
): RankedRow[] {
  const byId = new Map(managers.map((m) => [m.entryId, m]));
  const compare = comparator(order);
  const sorted = [...totals].sort(compare);

  const rows: RankedRow[] = [];
  let currentRank = 0;

  sorted.forEach((total, index) => {
    const tiedWithPrevious = index > 0 && compare(sorted[index - 1], total) === 0;
    if (!tiedWithPrevious) currentRank = index + 1;

    rows.push({
      ...total,
      rank: currentRank,
      manager: byId.get(total.entryId)!,
      shared: false,
    });
  });

  // Second pass: a row is shared if any neighbour holds the same rank.
  for (let i = 0; i < rows.length; i++) {
    rows[i].shared =
      (i > 0 && rows[i - 1].rank === rows[i].rank) ||
      (i < rows.length - 1 && rows[i + 1].rank === rows[i].rank);
  }

  return rows;
}

export interface Winner {
  entryId: number;
  points: number;
  /** Co-winners when every rule was exhausted. Empty in the normal case. */
  tiedWith: number[];
  /** The rule that settled it, or null if won outright on points. */
  decidedBy: TiebreakKey | null;
}

/**
 * Declares the winner of a ranked table.
 *
 * `decidedBy` records which rule actually separated first from second, so the
 * UI can say how it was won rather than leaving people to guess.
 */
export function declareWinner(
  rows: readonly RankedRow[],
  order: readonly TiebreakKey[],
): Winner | null {
  if (rows.length === 0) return null;

  const leaders = rows.filter((r) => r.rank === 1);
  const winner = leaders[0];
  const runnerUp = rows.find((r) => r.rank !== 1);

  let decidedBy: TiebreakKey | null = null;
  if (runnerUp) {
    for (const rule of order) {
      if (applyRule(rule, winner, runnerUp) !== 0) {
        decidedBy = rule === 'points' ? null : rule;
        break;
      }
    }
  }

  return {
    entryId: winner.entryId,
    points: winner.points,
    tiedWith: leaders.slice(1).map((r) => r.entryId),
    decidedBy,
  };
}

/* ------------------------------------------------------- table shortcuts */

export interface TableOptions {
  countPrejoinGws: boolean;
  tiebreakOrder: readonly TiebreakKey[];
}

export function weeklyTable(
  rows: readonly ScoreRow[],
  managers: readonly ManagerRef[],
  event: number,
  options: TableOptions,
): RankedRow[] {
  const totals = aggregate(rows, managers, {
    events: [event],
    countPrejoinGws: options.countPrejoinGws,
  }).filter((t) => t.gameweeks > 0);
  return rank(totals, managers, options.tiebreakOrder);
}

export function monthlyTable(
  rows: readonly ScoreRow[],
  managers: readonly ManagerRef[],
  events: readonly number[],
  options: TableOptions,
): RankedRow[] {
  const totals = aggregate(rows, managers, {
    events,
    countPrejoinGws: options.countPrejoinGws,
  }).filter((t) => t.gameweeks > 0);
  return rank(totals, managers, options.tiebreakOrder);
}

export function seasonTable(
  rows: readonly ScoreRow[],
  managers: readonly ManagerRef[],
  options: TableOptions,
): RankedRow[] {
  const totals = aggregate(rows, managers, { countPrejoinGws: options.countPrejoinGws });
  return rank(totals, managers, options.tiebreakOrder);
}
