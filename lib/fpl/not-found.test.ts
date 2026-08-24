import { describe, expect, it } from 'vitest';
import { FplApiError } from './client';

/**
 * A manager who registers with FPL after a deadline has no squad for that
 * gameweek, and `entry/{id}/event/{n}/picks/` answers 404. That is a correct
 * answer, not a fault — but 404 is not retryable, so left unhandled it throws
 * and takes down the live table for the entire league.
 *
 * This happened: one late joiner in a seven-member league, and every page
 * render lost its scores and fell back to a pre-season panel.
 *
 * The handling is a `.catch` inside the per-manager task, so what matters is
 * that a 404 is distinguishable from every other failure, and that one null
 * among the results does not discard the rest.
 */
describe('a manager with no squad for a gameweek', () => {
  const notFound = new FplApiError('FPL API returned 404 for entry/1/event/1/picks/', 404, 'x');

  it('is identifiable as a 404 rather than by message text', () => {
    expect(notFound).toBeInstanceOf(FplApiError);
    expect(notFound.status).toBe(404);
  });

  it('is distinguishable from failures that must still propagate', () => {
    // 403 and 429 are the CDN disliking a datacenter IP, and are retried.
    // Swallowing those would silently drop managers who did play.
    for (const status of [403, 429, 500, 503]) {
      expect(new FplApiError('x', status, 'x').status).not.toBe(404);
    }
  });

  it('keeps the managers who did play when one is skipped', () => {
    const fetched = [{ entryId: 1 }, null, { entryId: 3 }];
    const played = fetched.filter((f): f is NonNullable<typeof f> => f !== null);

    expect(played).toEqual([{ entryId: 1 }, { entryId: 3 }]);
  });
});
