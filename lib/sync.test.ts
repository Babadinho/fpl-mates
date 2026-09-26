import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the bootstrap fallback, which only ever runs while FPL is refusing
 * us — so it is never exercised in normal operation and would rot unnoticed.
 */

const fetchEvents = vi.fn();
const fetchLeagueRoster = vi.fn();

/** Rows the fake database returns for `select ... from gameweeks`. */
let stored: { season: number; event: number; deadlineTime: Date }[] = [];

vi.mock('./fpl/client', () => ({
  fetchEvents: () => fetchEvents(),
  fetchLeagueRoster: () => fetchLeagueRoster(),
}));

vi.mock('./config', () => ({
  getConfig: () => ({ leagueId: 99, rules: { timezone: 'Europe/London' } }),
}));

vi.mock('./db', () => ({
  getDb: () => {
    // Drizzle's builders chain and are awaited at the end, so one thenable
    // proxy standing in for every method covers the calls this module makes.
    const chain: Record<string, unknown> = {};
    for (const method of [
      'select',
      'from',
      'orderBy',
      'where',
      'limit',
      'insert',
      'values',
      'onConflictDoUpdate',
      'onConflictDoNothing',
      'update',
      'set',
    ]) {
      chain[method] = () => chain;
    }
    chain.returning = () => Promise.resolve([]);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(stored).then(resolve);
    return chain;
  },
}));

const roster = {
  leagueName: 'Test League',
  startEvent: 1,
  members: [
    {
      entryId: 1,
      entryName: 'Alpha FC',
      playerName: 'Alice',
      ranked: true,
      joinedTime: null,
    },
  ],
};

describe('syncReferenceData when bootstrap is refused', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchEvents.mockReset();
    fetchLeagueRoster.mockReset();
    fetchLeagueRoster.mockResolvedValue(roster);
  });

  it('falls back to the stored gameweeks and still syncs members', async () => {
    stored = [
      { season: 2026, event: 1, deadlineTime: new Date('2026-08-21T17:30:00Z') },
      { season: 2026, event: 2, deadlineTime: new Date('2026-08-28T17:30:00Z') },
    ];
    fetchEvents.mockRejectedValue(new Error('FPL API returned 403 for bootstrap-static/'));

    const { syncReferenceData } = await import('./sync');
    const result = await syncReferenceData();

    expect(result.season).toBe(2026);
    expect(result.gameweeks).toBe(2);
    expect(result.members).toBe(1);
    expect(result.degraded).toContain('403');
    // The roster is the point: losing bootstrap must not stop members syncing.
    expect(fetchLeagueRoster).toHaveBeenCalledOnce();
  });

  /**
   * After a rollover the table holds two seasons. The fallback has to pick the
   * newer one, or a refused bootstrap in August would sync members against
   * last season's deadlines.
   */
  it('falls back to the newest stored season, not all of them', async () => {
    stored = [
      { season: 2025, event: 1, deadlineTime: new Date('2025-08-15T17:30:00Z') },
      { season: 2025, event: 2, deadlineTime: new Date('2025-08-22T17:30:00Z') },
      { season: 2026, event: 1, deadlineTime: new Date('2026-08-21T17:30:00Z') },
    ];
    fetchEvents.mockRejectedValue(new Error('FPL API returned 403 for bootstrap-static/'));

    const { syncReferenceData } = await import('./sync');
    const result = await syncReferenceData();

    expect(result.season).toBe(2026);
    expect(result.gameweeks).toBe(1);
  });

  it('throws when there are no stored gameweeks to fall back on', async () => {
    stored = [];
    fetchEvents.mockRejectedValue(new Error('FPL API returned 403 for bootstrap-static/'));

    const { syncReferenceData } = await import('./sync');

    // A first run has nothing to degrade to, and reporting success would hide
    // a genuine setup failure.
    await expect(syncReferenceData()).rejects.toThrow('403');
  });

  it('reports no degradation when bootstrap succeeds', async () => {
    stored = [];
    fetchEvents.mockResolvedValue([
      {
        id: 1,
        deadline_time: '2026-08-21T17:30:00Z',
        finished: false,
        data_checked: false,
        average_entry_score: 0,
      },
    ]);

    const { syncReferenceData } = await import('./sync');
    const result = await syncReferenceData();

    expect(result.degraded).toBeNull();
    expect(result.season).toBe(2026);
    expect(result.gameweeks).toBe(1);
  });
});
