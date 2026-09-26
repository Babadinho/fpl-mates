import { describe, expect, it } from 'vitest';
import { seasonLabel, seasonOf } from './season';

describe('seasonOf', () => {
  it('reads the opening year off Gameweek 1', () => {
    expect(seasonOf('2026-08-21T17:30:00Z')).toBe(2026);
    expect(seasonOf(new Date('2027-08-13T17:30:00Z'))).toBe(2027);
  });

  it('cannot straddle a year, since Gameweek 1 is always in August', () => {
    expect(seasonOf('2026-08-31T23:59:59Z')).toBe(2026);
  });

  /**
   * Not a bug to fix: the caller's contract is to pass the opening deadline.
   * Pinned so nobody makes this clever and quietly changes what the callers
   * were relying on.
   */
  it('is only right for the opening deadline', () => {
    expect(seasonOf('2027-01-03T15:00:00Z')).toBe(2027);
  });
});

describe('seasonLabel', () => {
  it('writes the season as FPL does', () => {
    expect(seasonLabel(2026)).toBe('2026/27');
  });

  it('pads the closing year across a century', () => {
    expect(seasonLabel(2099)).toBe('2099/00');
  });
});
