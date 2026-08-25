import { describe, expect, it } from 'vitest';
import { gwRange, monthMeta, toUiRows } from './view';
import type { RankedRow } from './scoring/tables';

/**
 * A month holds however many gameweeks its deadlines fall in — two to six
 * normally, but one at either end of the season, and one for any month whose
 * later gameweeks have not been played yet.
 */
describe('gwRange', () => {
  it('writes a single gameweek plainly', () => {
    // "GW 1–1" reads as a scoreline, which is the wrong association here.
    expect(gwRange([1])).toBe('GW 1');
  });

  it('writes a span as a range', () => {
    expect(gwRange([10, 11, 12])).toBe('GW 10–12');
  });

  it('uses the ends, not the count', () => {
    expect(gwRange([3, 4, 5])).toBe('GW 3–5');
  });
});

describe('monthMeta', () => {
  it('does not name the live gameweek twice in a one-gameweek month', () => {
    expect(monthMeta([1], 1, false)).toBe('GW 1 · in play');
  });

  it('names the live gameweek when the month holds several', () => {
    expect(monthMeta([1, 2, 3], 3, false)).toBe('GW 1–3 · GW 3 in play');
  });

  it('says settled once every gameweek is in', () => {
    expect(monthMeta([1, 2, 3], null, true)).toBe('GW 1–3 · settled');
  });

  it('names the month as the unfinished thing, not the gameweek', () => {
    // "GW 1 · in progress" reads as Gameweek 1 still being played, which is
    // the opposite of true once it has settled and the month has not.
    expect(monthMeta([1], null, false)).toBe('GW 1 · month in progress');
    expect(monthMeta([1, 2], null, false)).toBe('GW 1–2 · month in progress');
  });

  it('ignores a live gameweek belonging to another month', () => {
    expect(monthMeta([1, 2], 5, true)).toBe('GW 1–2 · settled');
  });
});

/**
 * The "NEW" badge, whose rule is scoped to the period each table shows.
 *
 * The trap the brief calls out: evaluating "did they join recently?" against
 * the current gameweek for every table leaks the badge onto historical
 * gameweeks and the season, producing a new manager sitting 28th with a full
 * season of points behind them.
 */
describe('the new-manager badge', () => {
  const row = (joinedGw: number): RankedRow =>
    ({
      entryId: 1,
      rank: 1,
      shared: false,
      chip: null,
      points: 0,
      gross: 0,
      hits: 0,
      bench: 0,
      bonus: 0,
      gameweeks: 1,
      best: 0,
      overallRank: null,
      manager: { entryId: 1, playerName: 'A', entryName: 'B', joinedGw },
    }) as RankedRow;

  const badged = (r: RankedRow, rule: (row: RankedRow) => boolean) =>
    toUiRows([r], () => [''], false, rule)[0].isNew;

  it('never badges an original member, whatever the rule says', () => {
    expect(badged(row(1), () => true)).toBe(false);
  });

  it('badges a joiner in the gameweek they joined', () => {
    const weekly = (gw: number) => (r: RankedRow) => r.manager.joinedGw === gw;
    expect(badged(row(6), weekly(6))).toBe(true);
  });

  it('does not badge them in later gameweeks', () => {
    const weekly = (gw: number) => (r: RankedRow) => r.manager.joinedGw === gw;
    expect(badged(row(6), weekly(7))).toBe(false);
  });

  it('badges within the month they joined, not the months after', () => {
    const monthly = (events: number[]) => (r: RankedRow) => events.includes(r.manager.joinedGw);
    expect(badged(row(6), monthly([5, 6, 7]))).toBe(true);
    expect(badged(row(6), monthly([8, 9]))).toBe(false);
  });

  it('drops off the season table four gameweeks after joining', () => {
    const season = (played: number) => (r: RankedRow) => r.manager.joinedGw > played - 4;
    expect(badged(row(13), season(14))).toBe(true);
    expect(badged(row(13), season(38))).toBe(false);
  });
});
