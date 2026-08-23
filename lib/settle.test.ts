import { describe, expect, it } from 'vitest';
import { applySubs } from './settle';

/**
 * Automatic substitutions do not exist until a gameweek ends, so this cannot
 * be checked against a live response. It is covered here instead, including
 * the case where FPL has already applied them to `multiplier` itself.
 */
describe('applySubs', () => {
  const squad = [
    { element: 1, multiplier: 1 },
    { element: 2, multiplier: 2 },
    { element: 3, multiplier: 1 },
    { element: 12, multiplier: 0 },
    { element: 13, multiplier: 0 },
  ];

  it('leaves the squad alone when nobody was substituted', () => {
    const result = applySubs(squad, []);
    expect([...result]).toEqual([
      [1, 1],
      [2, 2],
      [3, 1],
      [12, 0],
      [13, 0],
    ]);
  });

  it('benches the player who came off and promotes the one who came on', () => {
    const result = applySubs(squad, [{ element_in: 12, element_out: 3 }]);
    expect(result.get(3)).toBe(0);
    expect(result.get(12)).toBe(1);
  });

  it('is a no-op when FPL already applied the substitution', () => {
    const applied = [
      { element: 1, multiplier: 1 },
      { element: 3, multiplier: 0 },
      { element: 12, multiplier: 1 },
    ];
    const result = applySubs(applied, [{ element_in: 12, element_out: 3 }]);
    expect(result.get(3)).toBe(0);
    expect(result.get(12)).toBe(1);
  });

  it('does not demote the captain when someone else is substituted', () => {
    const result = applySubs(squad, [{ element_in: 13, element_out: 1 }]);
    expect(result.get(2)).toBe(2);
    expect(result.get(13)).toBe(1);
  });

  it('handles several substitutions in one gameweek', () => {
    const result = applySubs(squad, [
      { element_in: 12, element_out: 1 },
      { element_in: 13, element_out: 3 },
    ]);
    expect([...result]).toEqual([
      [1, 0],
      [2, 2],
      [3, 0],
      [12, 1],
      [13, 1],
    ]);
  });
});
