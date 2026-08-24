import { describe, expect, it } from 'vitest';
import { gwRange, monthMeta } from './view';

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

  it('says in progress when gameweeks remain but none is being played', () => {
    expect(monthMeta([1], null, false)).toBe('GW 1 · in progress');
  });

  it('ignores a live gameweek belonging to another month', () => {
    expect(monthMeta([1, 2], 5, true)).toBe('GW 1–2 · settled');
  });
});
