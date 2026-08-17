import { describe, expect, it } from 'vitest';
import { entryPicksSchema, historyEntrySchema, liveEventSchema } from './schemas';

/**
 * The picks and live endpoints return nothing until a deadline has passed, so
 * these shapes were written from a specification and have never met a real
 * response. These tests pin down what happens when one drifts: fields a winner
 * is decided on must fail, fields that decorate must not.
 */

describe('history — decides winners, so it fails loudly', () => {
  const complete = {
    event: 1,
    points: 62,
    event_transfers_cost: 4,
    points_on_bench: 9,
    overall_rank: 250_000,
    total_points: 62,
    event_transfers: 2,
  };

  it('accepts a full entry', () => {
    expect(historyEntrySchema.parse(complete).points).toBe(62);
  });

  it.each(['points', 'event_transfers_cost', 'points_on_bench'])(
    'rejects a missing %s rather than scoring without it',
    (field) => {
      const { [field]: _, ...missing } = complete as Record<string, unknown>;
      expect(historyEntrySchema.safeParse(missing).success).toBe(false);
    },
  );

  it('tolerates fields nothing reads', () => {
    const { total_points: _t, event_transfers: _e, ...rest } = complete;
    expect(historyEntrySchema.safeParse(rest).success).toBe(true);
  });
});

describe('live — points required, provisional bonus optional', () => {
  it('rejects an element with no points', () => {
    const parsed = liveEventSchema.safeParse({ elements: [{ id: 1, stats: { minutes: 90 } }] });
    expect(parsed.success).toBe(false);
  });

  it('defaults bps and bonus, so a live table survives losing them', () => {
    const parsed = liveEventSchema.parse({
      elements: [{ id: 1, stats: { minutes: 90, total_points: 6 } }],
    });
    expect(parsed.elements[0].stats.bps).toBe(0);
    expect(parsed.elements[0].stats.bonus).toBe(0);
  });
});

describe('picks — squad required, badges optional', () => {
  const base = {
    active_chip: null,
    entry_history: { event: 1, event_transfers_cost: 0 },
    picks: [{ element: 100, position: 1, multiplier: 1 }],
  };

  it('parses without the captain flags, which no response has ever confirmed', () => {
    const parsed = entryPicksSchema.parse(base);
    expect(parsed.picks[0].is_captain).toBe(false);
    expect(parsed.picks[0].is_vice_captain).toBe(false);
  });

  it('reads them when present', () => {
    const parsed = entryPicksSchema.parse({
      ...base,
      picks: [{ element: 100, position: 1, multiplier: 2, is_captain: true, is_vice_captain: false }],
    });
    expect(parsed.picks[0].is_captain).toBe(true);
  });

  it('rejects a pick with no multiplier, which decides who is benched', () => {
    const parsed = entryPicksSchema.safeParse({
      ...base,
      picks: [{ element: 100, position: 1 }],
    });
    expect(parsed.success).toBe(false);
  });
});
