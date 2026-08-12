import { describe, expect, it } from 'vitest';
import { rowsForEvent, type ManagerHistory } from './poll';
import type { FplHistoryEntry } from './fpl/schemas';
import type { ManagerRef } from './scoring/tables';

const alice: ManagerRef = { entryId: 1, playerName: 'Alice', entryName: 'Alpha FC', joinedGw: 1 };
const bob: ManagerRef = { entryId: 2, playerName: 'Bob', entryName: 'Beta FC', joinedGw: 1 };

function entry(over: Partial<FplHistoryEntry> & { event: number }): FplHistoryEntry {
  return {
    points: 50,
    total_points: 50,
    event_transfers: 0,
    event_transfers_cost: 0,
    points_on_bench: 0,
    overall_rank: 500_000,
    ...over,
  };
}

function history(
  manager: ManagerRef,
  entries: FplHistoryEntry[],
  chips: [number, string][] = [],
): ManagerHistory {
  return {
    manager,
    byEvent: new Map(entries.map((e) => [e.event, e])),
    chips: new Map(chips),
  };
}

describe('rowsForEvent', () => {
  it('carries FPL gross points and cost across without altering them', () => {
    // `points` is GROSS. The subtraction happens in the scoring layer, never here.
    const rows = rowsForEvent(
      [history(alice, [entry({ event: 5, points: 80, event_transfers_cost: 8 })])],
      5,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entryId: 1, event: 5, grossPoints: 80, transferCost: 8 });
  });

  it('takes only the requested gameweek', () => {
    const rows = rowsForEvent(
      [history(alice, [entry({ event: 4, points: 40 }), entry({ event: 5, points: 90 })])],
      5,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].grossPoints).toBe(90);
  });

  it('omits a manager who did not play that gameweek rather than scoring them zero', () => {
    const rows = rowsForEvent(
      [history(alice, [entry({ event: 5 })]), history(bob, [entry({ event: 6 })])],
      5,
    );
    expect(rows.map((r) => r.entryId)).toEqual([1]);
  });

  it('attaches a chip only to the gameweek it was played in', () => {
    const histories = [
      history(alice, [entry({ event: 5 }), entry({ event: 6 })], [[6, 'BB']]),
    ];
    expect(rowsForEvent(histories, 5)[0].chipUsed).toBeNull();
    expect(rowsForEvent(histories, 6)[0].chipUsed).toBe('BB');
  });

  it('preserves bench points and overall rank for the tie-breaks', () => {
    const rows = rowsForEvent(
      [history(alice, [entry({ event: 5, points_on_bench: 14, overall_rank: 123 })])],
      5,
    );
    expect(rows[0]).toMatchObject({ pointsOnBench: 14, overallRank: 123 });
  });

  it('tolerates a null overall rank', () => {
    const rows = rowsForEvent([history(alice, [entry({ event: 5, overall_rank: null })])], 5);
    expect(rows[0].overallRank).toBeNull();
  });

  it('returns nothing when no manager has data for the gameweek', () => {
    // The poller treats this as "do not process", so a partial gameweek never
    // declares a winner.
    expect(rowsForEvent([history(alice, [entry({ event: 1 })])], 9)).toEqual([]);
  });
});
