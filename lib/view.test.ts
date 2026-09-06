import { describe, expect, it } from 'vitest';
import {
  gwRange,
  isAwaitingConfirmation,
  isGameweekUnderway,
  isLiveStillUsable,
  monthMeta,
  toUiRows,
} from './view';
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

// The regression this guards: the predicate used to be gated on the season
// being unstarted, so GW1 settling silently disabled it for every gameweek
// after. Taking only a deadline and a clock is what makes that unexpressible —
// these cases pin the boundary the gate was hiding.
describe('isGameweekUnderway', () => {
  const now = Date.parse('2026-08-29T12:00:00Z');
  const week = (iso: string) => ({ deadlineTime: new Date(iso) });

  it('is under way once the deadline has gone', () => {
    expect(isGameweekUnderway(week('2026-08-28T17:30:00Z'), now)).toBe(true);
  });

  it('is not under way while the deadline is still ahead', () => {
    expect(isGameweekUnderway(week('2026-09-04T17:30:00Z'), now)).toBe(false);
  });

  it('is not under way once every gameweek has settled', () => {
    expect(isGameweekUnderway(undefined, now)).toBe(false);
  });

  it('treats the deadline instant itself as under way', () => {
    expect(isGameweekUnderway(week('2026-08-29T12:00:00Z'), now)).toBe(true);
  });
});

/**
 * FPL confirms a gameweek up to a day after the last whistle, but the points
 * stop moving as soon as the final bonus is awarded. Naming the winner in that
 * gap is only safe if the gap is detected exactly.
 */
describe('isAwaitingConfirmation', () => {
  const live = (finished: number, total: number, bonusPending: boolean) => ({
    finished,
    total,
    bonusPending,
  });

  it('is awaiting confirmation once every fixture is played and paid', () => {
    expect(isAwaitingConfirmation(live(10, 10, false))).toBe(true);
  });

  /**
   * The Saturday-evening trap. `bonusPending` only looks at fixtures that have
   * started, so it goes false the moment Saturday's bonus lands — hours before
   * Sunday kicks off. Measured live during Gameweek 3: 8 of 10 played, real
   * bonus on all eight, `bonusPending` already false.
   */
  it('is not awaiting confirmation while fixtures are still to be played', () => {
    expect(isAwaitingConfirmation(live(8, 10, false))).toBe(false);
  });

  it('is not awaiting confirmation between the last whistle and the bonus', () => {
    expect(isAwaitingConfirmation(live(10, 10, true))).toBe(false);
  });

  it('is not awaiting confirmation before a ball is kicked', () => {
    expect(isAwaitingConfirmation(live(0, 10, false))).toBe(false);
  });

  // Nothing played is not everything played, however the equality reads.
  it('is not awaiting confirmation on a gameweek with no fixtures', () => {
    expect(isAwaitingConfirmation(live(0, 0, false))).toBe(false);
  });

  it('is not awaiting confirmation when the live picture never arrived', () => {
    expect(isAwaitingConfirmation(null)).toBe(false);
  });
});

/**
 * The page gives the live fetch 2.5 seconds, but a refused request is retried
 * over about fifteen — so a single 403 from FPL's CDN spends the budget, and
 * the answer that arrives moments later would otherwise be thrown away and
 * followed by a minute of not asking. Holding the last picture covers that gap.
 */
describe('isLiveStillUsable', () => {
  const now = Date.parse('2026-09-06T18:00:00Z');
  const cached = (event: number, iso: string) => ({ event, fetchedAt: new Date(iso) });

  it('stands in for a fetch that just missed its budget', () => {
    expect(isLiveStillUsable(cached(3, '2026-09-06T17:59:30Z'), 3, now)).toBe(true);
  });

  it('stops standing in once it is old enough to mislead', () => {
    expect(isLiveStillUsable(cached(3, '2026-09-06T17:50:00Z'), 3, now)).toBe(false);
  });

  /**
   * The dangerous case. After a gameweek settles this still holds the round
   * that just ended, and serving those scores as the new gameweek's would be
   * an invention rather than a stale reading.
   */
  it('never stands in for a different gameweek', () => {
    expect(isLiveStillUsable(cached(3, '2026-09-06T17:59:30Z'), 4, now)).toBe(false);
  });

  it('has nothing to offer before the first fetch of a process', () => {
    expect(isLiveStillUsable(null, 3, now)).toBe(false);
  });
});
