import { describe, expect, it } from 'vitest';
import type { TiebreakKey } from '../config';
import {
  aggregate,
  declareWinner,
  pointsAfterCost,
  rank,
  seasonTable,
  weeklyTable,
  type ManagerRef,
  type ScoreRow,
} from './tables';

const ORDER: TiebreakKey[] = ['points', 'hits', 'bench', 'overall_rank'];
const OPTIONS = { countPrejoinGws: false, tiebreakOrder: ORDER };

const managers: ManagerRef[] = [
  { entryId: 1, playerName: 'Alice', entryName: 'Alpha FC', joinedGw: 1 },
  { entryId: 2, playerName: 'Bob', entryName: 'Beta FC', joinedGw: 1 },
  { entryId: 3, playerName: 'Cara', entryName: 'Gamma FC', joinedGw: 1 },
];

function row(over: Partial<ScoreRow> & Pick<ScoreRow, 'entryId' | 'event'>): ScoreRow {
  return {
    grossPoints: 50,
    transferCost: 0,
    pointsOnBench: 0,
    overallRank: null,
    chipUsed: null,
    ...over,
  };
}

describe('pointsAfterCost', () => {
  it('subtracts the transfer cost from gross', () => {
    expect(pointsAfterCost({ grossPoints: 80, transferCost: 8 })).toBe(72);
  });

  it('is the measure that decides order — 80 with a -8 loses to a clean 74', () => {
    const withHit = pointsAfterCost({ grossPoints: 80, transferCost: 8 });
    const clean = pointsAfterCost({ grossPoints: 74, transferCost: 0 });
    expect(withHit).toBeLessThan(clean);
  });
});

describe('tie-breaks', () => {
  it('ranks on points first', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 60 }),
      row({ entryId: 2, event: 1, grossPoints: 80 }),
      row({ entryId: 3, event: 1, grossPoints: 70 }),
    ];
    expect(weeklyTable(rows, managers, 1, OPTIONS).map((r) => r.entryId)).toEqual([2, 3, 1]);
  });

  it('breaks a points tie on fewest hits', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 80, transferCost: 8 }),
      row({ entryId: 2, event: 1, grossPoints: 72, transferCost: 0 }),
    ];
    const table = weeklyTable(rows, managers, 1, OPTIONS);
    expect(table[0].entryId).toBe(2);
    expect(table[0].points).toBe(72);
    expect(table[1].points).toBe(72);
  });

  it('breaks a hits tie on fewest bench points', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 70, pointsOnBench: 14 }),
      row({ entryId: 2, event: 1, grossPoints: 70, pointsOnBench: 3 }),
    ];
    expect(weeklyTable(rows, managers, 1, OPTIONS)[0].entryId).toBe(2);
  });

  it('falls through to overall rank', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 70, overallRank: 900_000 }),
      row({ entryId: 2, event: 1, grossPoints: 70, overallRank: 120_000 }),
    ];
    expect(weeklyTable(rows, managers, 1, OPTIONS)[0].entryId).toBe(2);
  });

  it('sorts a null overall rank last instead of letting it win', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 70, overallRank: null }),
      row({ entryId: 2, event: 1, grossPoints: 70, overallRank: 500_000 }),
    ];
    expect(weeklyTable(rows, managers, 1, OPTIONS)[0].entryId).toBe(2);
  });

  it('shares the rank when every rule is exhausted', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 70 }),
      row({ entryId: 2, event: 1, grossPoints: 70 }),
    ];
    const table = weeklyTable(rows, managers, 1, OPTIONS);
    expect(table[0].rank).toBe(1);
    expect(table[1].rank).toBe(1);
    expect(table.every((r) => r.shared)).toBe(true);
  });

  it('resumes numbering after a shared rank', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 70 }),
      row({ entryId: 2, event: 1, grossPoints: 70 }),
      row({ entryId: 3, event: 1, grossPoints: 50 }),
    ];
    expect(weeklyTable(rows, managers, 1, OPTIONS).map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it('honours a custom rule order', () => {
    // Bench before hits reverses who wins.
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 78, transferCost: 8, pointsOnBench: 2 }),
      row({ entryId: 2, event: 1, grossPoints: 74, transferCost: 4, pointsOnBench: 20 }),
    ];
    const byHits = weeklyTable(rows, managers, 1, OPTIONS);
    const byBench = weeklyTable(rows, managers, 1, {
      ...OPTIONS,
      tiebreakOrder: ['points', 'bench', 'hits'],
    });
    expect(byHits[0].entryId).toBe(2);
    expect(byBench[0].entryId).toBe(1);
  });
});

describe('declareWinner', () => {
  it('reports null decidedBy for an outright win on points', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 90 }),
      row({ entryId: 2, event: 1, grossPoints: 60 }),
    ];
    const winner = declareWinner(weeklyTable(rows, managers, 1, OPTIONS), ORDER);
    expect(winner).toMatchObject({ entryId: 1, points: 90, decidedBy: null, tiedWith: [] });
  });

  it('names the rule that settled it', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 80, transferCost: 8 }),
      row({ entryId: 2, event: 1, grossPoints: 72, transferCost: 0 }),
    ];
    expect(declareWinner(weeklyTable(rows, managers, 1, OPTIONS), ORDER)?.decidedBy).toBe('hits');
  });

  it('lists co-winners on a fully shared win', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 70 }),
      row({ entryId: 2, event: 1, grossPoints: 70 }),
    ];
    const winner = declareWinner(weeklyTable(rows, managers, 1, OPTIONS), ORDER);
    expect(winner?.tiedWith).toEqual([2]);
  });

  it('returns null for an empty table', () => {
    expect(declareWinner([], ORDER)).toBeNull();
  });
});

describe('mid-season joiners (gotcha 5)', () => {
  const late: ManagerRef[] = [
    ...managers.slice(0, 2),
    { entryId: 3, playerName: 'Cara', entryName: 'Gamma FC', joinedGw: 3 },
  ];
  const rows = [
    row({ entryId: 3, event: 1, grossPoints: 99 }),
    row({ entryId: 3, event: 2, grossPoints: 99 }),
    row({ entryId: 3, event: 3, grossPoints: 40 }),
    row({ entryId: 1, event: 1, grossPoints: 50 }),
    row({ entryId: 1, event: 2, grossPoints: 50 }),
    row({ entryId: 1, event: 3, grossPoints: 50 }),
  ];

  it('excludes pre-join gameweeks by default', () => {
    const table = seasonTable(rows, late, OPTIONS);
    expect(table.find((r) => r.entryId === 3)!.points).toBe(40);
    expect(table.find((r) => r.entryId === 3)!.gameweeks).toBe(1);
  });

  it('includes them when COUNT_PREJOIN_GWS is on', () => {
    const table = seasonTable(rows, late, { ...OPTIONS, countPrejoinGws: true });
    expect(table.find((r) => r.entryId === 3)!.points).toBe(238);
  });

  it('keeps a late joiner out of a gameweek they were not in', () => {
    expect(weeklyTable(rows, late, 1, OPTIONS).map((r) => r.entryId)).toEqual([1]);
  });
});

describe('aggregate', () => {
  const rows = [
    row({ entryId: 1, event: 1, grossPoints: 60, transferCost: 4, pointsOnBench: 5, overallRank: 300 }),
    row({ entryId: 1, event: 2, grossPoints: 80, transferCost: 0, pointsOnBench: 2, overallRank: 150 }),
  ];

  it('sums points, hits and bench across gameweeks', () => {
    const [total] = aggregate(rows, [managers[0]], { countPrejoinGws: false });
    expect(total).toMatchObject({ points: 136, gross: 140, hits: 4, bench: 7, gameweeks: 2 });
  });

  it('keeps the best single gameweek', () => {
    expect(aggregate(rows, [managers[0]], { countPrejoinGws: false })[0].best).toBe(80);
  });

  it('takes the most recent overall rank, not the first', () => {
    expect(aggregate(rows, [managers[0]], { countPrejoinGws: false })[0].overallRank).toBe(150);
  });

  it('includes managers with no rows so a gap is visible rather than silent', () => {
    const totals = aggregate([], managers, { countPrejoinGws: false });
    expect(totals).toHaveLength(3);
    expect(totals.every((t) => t.gameweeks === 0)).toBe(true);
  });

  it('restricts to the requested gameweeks', () => {
    const [total] = aggregate(rows, [managers[0]], { events: [2], countPrejoinGws: false });
    expect(total.points).toBe(80);
  });
});

describe('rank', () => {
  it('attaches the manager record to each row', () => {
    const totals = aggregate([row({ entryId: 1, event: 1 })], managers, { countPrejoinGws: false });
    expect(rank(totals, managers, ORDER)[0].manager.playerName).toBeTypeOf('string');
  });
});

describe('transfer costs come from FPL, not from us', () => {
  // We never derive the cost from the transfer count. `event_transfers_cost`
  // is FPL's own figure and already accounts for banked free transfers (up to
  // five) and for chips that make transfers free. Recomputing it here would
  // get Wildcard and Free Hit weeks wrong.
  it('charges nothing for a Wildcard week with many transfers', () => {
    const rows = [
      row({ entryId: 1, event: 1, grossPoints: 88, transferCost: 0, chipUsed: 'WC' }),
      row({ entryId: 2, event: 1, grossPoints: 84, transferCost: 0 }),
    ];
    const table = weeklyTable(rows, managers, 1, OPTIONS);
    expect(table[0].entryId).toBe(1);
    expect(table[0].points).toBe(88);
  });

  it('charges nothing for a Free Hit week', () => {
    const rows = [row({ entryId: 1, event: 1, grossPoints: 70, transferCost: 0, chipUsed: 'FH' })];
    expect(weeklyTable(rows, managers, 1, OPTIONS)[0].points).toBe(70);
  });

  it('applies whatever cost FPL reports, without inferring it', () => {
    // Two free transfers banked, three made: FPL charges for one, not three.
    const rows = [row({ entryId: 1, event: 1, grossPoints: 70, transferCost: 4 })];
    expect(weeklyTable(rows, managers, 1, OPTIONS)[0].points).toBe(66);
  });

  it('surfaces the chip that was played', () => {
    const rows = [row({ entryId: 1, event: 1, grossPoints: 70, chipUsed: 'BB' })];
    expect(weeklyTable(rows, managers, 1, OPTIONS)[0].chip).toBe('BB');
  });
});
