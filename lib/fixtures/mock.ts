/**
 * Deterministic mock league.
 *
 * Two jobs: it lets the design be finished before the season
 * starts, and it lets the app be run and the tests pass without touching the
 * live API. Enabled with USE_FIXTURES=1.
 *
 * The deadlines below are the REAL 2026/27 ones, so the month grouping this
 * produces — August 2, September 3, October 4, November 3 — matches what the
 * live data will do. Everything else is invented.
 */
import type { ManagerRef, ScoreRow } from '../scoring/tables';

/** All 38 gameweeks, with their real 2026/27 deadlines. */
export const MOCK_GAMEWEEKS = [
  { event: 1, deadlineTime: '2026-08-21T17:30:00Z' },
  { event: 2, deadlineTime: '2026-08-28T17:30:00Z' },
  { event: 3, deadlineTime: '2026-09-04T17:30:00Z' },
  { event: 4, deadlineTime: '2026-09-12T12:30:00Z' },
  { event: 5, deadlineTime: '2026-09-18T17:30:00Z' },
  { event: 6, deadlineTime: '2026-10-10T12:30:00Z' },
  { event: 7, deadlineTime: '2026-10-17T12:30:00Z' },
  { event: 8, deadlineTime: '2026-10-24T12:30:00Z' },
  { event: 9, deadlineTime: '2026-10-31T13:30:00Z' },
  { event: 10, deadlineTime: '2026-11-07T13:30:00Z' },
  { event: 11, deadlineTime: '2026-11-21T13:30:00Z' },
  { event: 12, deadlineTime: '2026-11-28T13:30:00Z' },
  { event: 13, deadlineTime: '2026-12-02T18:30:00Z' },
  { event: 14, deadlineTime: '2026-12-05T13:30:00Z' },
  { event: 15, deadlineTime: '2026-12-12T13:30:00Z' },
  { event: 16, deadlineTime: '2026-12-19T13:30:00Z' },
  { event: 17, deadlineTime: '2026-12-26T13:30:00Z' },
  { event: 18, deadlineTime: '2026-12-30T18:30:00Z' },
  { event: 19, deadlineTime: '2027-01-02T13:30:00Z' },
  { event: 20, deadlineTime: '2027-01-06T18:30:00Z' },
  { event: 21, deadlineTime: '2027-01-16T13:30:00Z' },
  { event: 22, deadlineTime: '2027-01-23T13:30:00Z' },
  { event: 23, deadlineTime: '2027-01-30T13:30:00Z' },
  { event: 24, deadlineTime: '2027-02-06T13:30:00Z' },
  { event: 25, deadlineTime: '2027-02-10T18:30:00Z' },
  { event: 26, deadlineTime: '2027-02-20T13:30:00Z' },
  { event: 27, deadlineTime: '2027-02-27T13:30:00Z' },
  { event: 28, deadlineTime: '2027-03-03T18:30:00Z' },
  { event: 29, deadlineTime: '2027-03-13T13:30:00Z' },
  { event: 30, deadlineTime: '2027-03-20T13:30:00Z' },
  { event: 31, deadlineTime: '2027-04-10T12:30:00Z' },
  { event: 32, deadlineTime: '2027-04-17T12:30:00Z' },
  { event: 33, deadlineTime: '2027-04-24T12:30:00Z' },
  { event: 34, deadlineTime: '2027-05-01T12:30:00Z' },
  { event: 35, deadlineTime: '2027-05-08T12:30:00Z' },
  { event: 36, deadlineTime: '2027-05-15T12:30:00Z' },
  { event: 37, deadlineTime: '2027-05-23T12:30:00Z' },
  { event: 38, deadlineTime: '2027-05-30T13:30:00Z' },
] as const;

/** The last gameweek with settled scores. */
export const MOCK_PLAYED = 12;

const PEOPLE: [string, string][] = [
  ['Dev Mehta', 'Salah Days a Week'],
  ['Tom Whitfield', 'Bench Warmers FC'],
  ['Ayo Adeyemi', 'Rashford Impulse'],
  ['Priya Raman', 'Cleanest Sheets'],
  ['Marcus Cole', 'Fourth Officials'],
  ['Jonah Beck', 'Set Piece Theory'],
  ['Sam Okonjo', 'Expected Goals Only'],
  ['Rory Nash', 'Wildcard Wednesday'],
  ['Leo Fontaine', 'Assist Merchants'],
  ['Hana Suzuki', 'The Fergie Times'],
  ['Ben Arroyo', 'Two Up Front'],
  ['Kit Danvers', 'Parked The Bus'],
];

/** Chips played: gameweek → [manager index, chip badge]. */
const CHIPS: Record<number, [number, string]> = {
  4: [2, 'FH'],
  6: [7, 'BB'],
  8: [0, 'TC'],
  9: [5, 'WC'],
  11: [9, 'TC'],
  12: [3, 'BB'],
};

/** One manager joins late, so the pre-join rule is visible in the UI. */
const LATE_JOINER = { index: 11, joinedGw: 4 };

/** Linear congruential generator — same sequence on every run and platform. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

export function mockManagers(): ManagerRef[] {
  return PEOPLE.map(([playerName, entryName], i) => ({
    entryId: 100000 + i * 7,
    playerName,
    entryName,
    joinedGw: i === LATE_JOINER.index ? LATE_JOINER.joinedGw : 1,
  }));
}

export function mockScores(managers: ManagerRef[] = mockManagers()): ScoreRow[] {
  const random = makeRandom(20260827);
  const rows: ScoreRow[] = [];

  for (let event = 1; event <= MOCK_PLAYED; event++) {
    managers.forEach((manager, i) => {
      if (event < manager.joinedGw) return;

      // Roughly 38–90, with an occasional big haul.
      const grossPoints = Math.round(38 + random() * 52 + (random() > 0.86 ? 22 : 0));
      const roll = random();
      const transferCost = roll > 0.86 ? 8 : roll > 0.66 ? 4 : 0;
      const chip = CHIPS[event];

      rows.push({
        entryId: manager.entryId,
        event,
        grossPoints,
        transferCost,
        pointsOnBench: Math.round(random() * 19),
        // Rough share of a real score: a handful of players pick up bonus.
        bonus: Math.round(random() * 12),
        overallRank: Math.round(150_000 + random() * 900_000),
        chipUsed: chip && chip[0] === i ? chip[1] : null,
      });
    });
  }

  return rows;
}

export interface MockLeague {
  leagueName: string;
  managers: ManagerRef[];
  scores: ScoreRow[];
  gameweeks: { event: number; deadlineTime: string }[];
  played: number;
}

export function mockLeague(): MockLeague {
  const managers = mockManagers();
  return {
    leagueName: 'The Sunday League',
    managers,
    scores: mockScores(managers),
    gameweeks: [...MOCK_GAMEWEEKS],
    played: MOCK_PLAYED,
  };
}
