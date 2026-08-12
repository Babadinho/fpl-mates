import { describe, expect, it } from 'vitest';
import { provisionalBonus, provisionalBonusByElement } from './bonus';

const bps = (...pairs: [number, number][]) => pairs.map(([elementId, bps]) => ({ elementId, bps }));

describe('provisionalBonus', () => {
  it('awards 3, 2, 1 to the top three', () => {
    const got = provisionalBonus(bps([1, 35], [2, 30], [3, 28], [4, 12]));
    expect([...got]).toEqual([
      [1, 3],
      [2, 2],
      [3, 1],
    ]);
  });

  it('gives both players 3 when two tie for first, then skips 2', () => {
    const got = provisionalBonus(bps([1, 35], [2, 35], [3, 28]));
    expect(got.get(1)).toBe(3);
    expect(got.get(2)).toBe(3);
    expect(got.get(3)).toBe(1);
  });

  it('gives both players 2 when two tie for second, and awards no 1', () => {
    const got = provisionalBonus(bps([1, 35], [2, 30], [3, 30], [4, 20]));
    expect(got.get(1)).toBe(3);
    expect(got.get(2)).toBe(2);
    expect(got.get(3)).toBe(2);
    expect(got.has(4)).toBe(false);
  });

  it('gives all three 3 when three tie for first', () => {
    const got = provisionalBonus(bps([1, 35], [2, 35], [3, 35], [4, 30]));
    expect([...got.values()]).toEqual([3, 3, 3]);
    expect(got.has(4)).toBe(false);
  });

  it('awards nothing before a ball is kicked', () => {
    // Every player sits on 0 BPS until the match starts.
    expect(provisionalBonus(bps([1, 0], [2, 0], [3, 0])).size).toBe(0);
  });

  it('ignores negative BPS', () => {
    const got = provisionalBonus(bps([1, 20], [2, -3]));
    expect(got.get(1)).toBe(3);
    expect(got.has(2)).toBe(false);
  });

  it('handles a fixture with fewer than three scorers', () => {
    const got = provisionalBonus(bps([1, 20], [2, 10]));
    expect(got.get(1)).toBe(3);
    expect(got.get(2)).toBe(2);
    expect(got.size).toBe(2);
  });
});

describe('provisionalBonusByElement', () => {
  it('sums across fixtures', () => {
    const got = provisionalBonusByElement([
      { fixtureId: 1, bonusAwarded: false, entries: bps([1, 35], [2, 30]) },
      { fixtureId: 2, bonusAwarded: false, entries: bps([3, 40]) },
    ]);
    expect(got.get(1)).toBe(3);
    expect(got.get(2)).toBe(2);
    expect(got.get(3)).toBe(3);
  });

  it('skips a fixture whose bonus FPL has already awarded', () => {
    // The real bonus is already inside total_points; adding ours double-counts.
    const got = provisionalBonusByElement([
      { fixtureId: 1, bonusAwarded: true, entries: bps([1, 35], [2, 30]) },
    ]);
    expect(got.size).toBe(0);
  });

  it('mixes settled and in-play fixtures correctly', () => {
    const got = provisionalBonusByElement([
      { fixtureId: 1, bonusAwarded: true, entries: bps([1, 99]) },
      { fixtureId: 2, bonusAwarded: false, entries: bps([2, 40]) },
    ]);
    expect(got.has(1)).toBe(false);
    expect(got.get(2)).toBe(3);
  });
});
