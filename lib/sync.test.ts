import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Covers the bootstrap fallback, which only ever runs while FPL is refusing
 * us — so it is never exercised in normal operation and would rot unnoticed.
 */

const fetchEvents = vi.fn();
const fetchLeagueRoster = vi.fn();

/** Rows the fake database returns for `select ... from gameweeks`. */
let stored: { season: number; event: number; deadlineTime: Date }[] = [];
/** Results for the next selects, in order; `stored` once it runs out. */
let selects: unknown[][] = [];
/** Every `.values(...)` argument, in order. */
let inserted: unknown[][] = [];

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
    let selecting = false;
    for (const method of [
      'from',
      'orderBy',
      'where',
      'limit',
      'insert',
      'values',
      'onConflictDoUpdate',
      'onConflictDoNothing',
      'set',
    ]) {
      chain[method] = () => chain;
    }
    chain.select = () => ((selecting = true), chain);
    chain.insert = chain.update = () => ((selecting = false), chain);
    chain.values = (rows: unknown[]) => (inserted.push(rows), chain);
    chain.returning = () => Promise.resolve([]);
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(selecting && selects.length > 0 ? selects.shift() : stored).then(resolve);
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

/** Rows written to manager_seasons, picked out by their shape. */
const seasonRows = () => inserted.flat().filter((r) => typeof r === 'object' && r !== null && 'joinedGw' in r);

const pastSeason = [
  { id: 1, deadline_time: '2026-08-21T17:30:00Z', finished: true, data_checked: true, average_entry_score: 50 },
  { id: 2, deadline_time: '2026-08-28T17:30:00Z', finished: true, data_checked: true, average_entry_score: 50 },
];

describe('syncMembers at the season boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    fetchEvents.mockReset();
    fetchLeagueRoster.mockReset();
    stored = [];
    selects = [];
    inserted = [];
  });

  it('gives no season row to someone who joined after its final deadline', async () => {
    fetchEvents.mockResolvedValue(pastSeason);
    fetchLeagueRoster.mockResolvedValue({
      ...roster,
      members: [
        roster.members[0],
        { entryId: 2, entryName: 'Late FC', playerName: 'Lou', ranked: false, joinedTime: new Date('2027-06-01T00:00:00Z') },
      ],
    });

    const { syncReferenceData } = await import('./sync');
    await syncReferenceData();

    // Alice was there all along; Lou belongs to next season, not GW2 of this one.
    expect(seasonRows()).toEqual([{ season: 2026, entryId: 1, joinedGw: 1 }]);
  });

  it('carries active managers into a season whose roster is empty', async () => {
    fetchEvents.mockResolvedValue(pastSeason);
    fetchLeagueRoster.mockResolvedValue({ ...roster, members: [] });
    selects = [[], [{ entryId: 1 }, { entryId: 2 }]];

    const { syncReferenceData } = await import('./sync');
    await syncReferenceData();

    expect(seasonRows()).toEqual([
      { season: 2026, entryId: 1, joinedGw: 1 },
      { season: 2026, entryId: 2, joinedGw: 1 },
    ]);
  });

  it('carries nobody once the season already has members', async () => {
    fetchEvents.mockResolvedValue(pastSeason);
    fetchLeagueRoster.mockResolvedValue({ ...roster, members: [] });
    selects = [[{ entryId: 1 }]];

    const { syncReferenceData } = await import('./sync');
    await syncReferenceData();

    expect(seasonRows()).toEqual([]);
  });
});
