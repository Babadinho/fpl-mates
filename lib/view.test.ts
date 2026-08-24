import { describe, expect, it } from 'vitest';
import { gwRange } from './view';

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
