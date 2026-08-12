/**
 * Provisional bonus points, derived from live BPS.
 *
 * FPL awards 3, 2 and 1 bonus points to the top three BPS scorers in each
 * fixture, but only once the match is confirmed — during play the `bonus`
 * field is 0 and only `bps` moves. A live table that ignored this would show
 * every score jumping an hour after full time, which reads as a bug.
 *
 * Pure and I/O-free, like the rest of `lib/scoring`.
 *
 * Ties follow FPL's published rule: tied players all take the higher award,
 * and the awards below are pushed down by however many places were consumed.
 *
 *   35, 30, 28  →  3, 2, 1
 *   35, 35, 28  →  3, 3, 1      (two share first; second place is consumed)
 *   35, 30, 30  →  3, 2, 2      (two share second; no 1 is awarded)
 *   35, 35, 35  →  3, 3, 3
 */

export interface BpsEntry {
  elementId: number;
  bps: number;
}

/**
 * Bonus per player for a single fixture, keyed by element id.
 *
 * Players on zero BPS are never awarded — an unplayed fixture has every player
 * on 0, and awarding three of them bonus would be nonsense.
 */
export function provisionalBonus(entries: readonly BpsEntry[]): Map<number, number> {
  const awarded = new Map<number, number>();

  const scores = [...new Set(entries.map((e) => e.bps))]
    .filter((bps) => bps > 0)
    .sort((a, b) => b - a);

  let placesUsed = 0;

  for (const score of scores) {
    // 0 places used → 3 points, 1 → 2, 2 → 1, beyond that nothing.
    const points = [3, 2, 1][placesUsed];
    if (points === undefined) break;

    const tied = entries.filter((e) => e.bps === score);
    for (const entry of tied) awarded.set(entry.elementId, points);

    placesUsed += tied.length;
  }

  return awarded;
}

export interface FixtureBps {
  fixtureId: number;
  /** Whether FPL has already awarded real bonus for this fixture. */
  bonusAwarded: boolean;
  entries: BpsEntry[];
}

/**
 * Bonus across several fixtures.
 *
 * A fixture whose bonus FPL has already awarded is skipped — the real value is
 * already inside each player's `total_points`, and adding a provisional figure
 * on top would double-count it.
 */
export function provisionalBonusByElement(fixtures: readonly FixtureBps[]): Map<number, number> {
  const all = new Map<number, number>();

  for (const fixture of fixtures) {
    if (fixture.bonusAwarded) continue;
    for (const [elementId, points] of provisionalBonus(fixture.entries)) {
      all.set(elementId, (all.get(elementId) ?? 0) + points);
    }
  }

  return all;
}
