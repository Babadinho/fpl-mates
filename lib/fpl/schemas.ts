/**
 * Zod schemas for every FPL API response we consume.
 *
 * Field names have changed between seasons
 * before, and a silently-defaulted zero would corrupt a monthly table. Every
 * field we actually use is required here, so drift fails loudly at the
 * boundary instead of quietly halfway through a scoring query.
 *
 * Unknown extra fields are stripped, not rejected — the API adds keys often
 * and that is never our problem.
 */
import { z } from 'zod';

/* ------------------------------------------------------------ bootstrap */

export const eventSchema = z.object({
  id: z.number().int().min(1).max(38),
  name: z.string(),
  /** ISO timestamp. Assigns the gameweek to a calendar month. */
  deadline_time: z.string(),
  finished: z.boolean(),
  /** Bonus applied and stats final. The flag to gate on — NOT `finished`. */
  data_checked: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean(),
  is_previous: z.boolean(),
  /** Null before the gameweek is played. */
  average_entry_score: z.number().int().nullable().default(0),
});

export const bootstrapSchema = z.object({
  events: z.array(eventSchema).min(1),
  /** Needed for fixture short codes (ARS, BHA) and to map players to fixtures. */
  teams: z.array(z.object({ id: z.number().int(), short_name: z.string(), name: z.string() })),
  elements: z.array(z.object({ id: z.number().int(), team: z.number().int() })),
});

export type FplEvent = z.infer<typeof eventSchema>;

/* -------------------------------------------------------------- league */

/** A ranked member — present once the season is under way. */
export const standingsResultSchema = z.object({
  entry: z.number().int().positive(),
  entry_name: z.string(),
  player_name: z.string(),
  rank: z.number().int(),
  last_rank: z.number().int(),
  event_total: z.number().int(),
  total: z.number().int(),
});

/**
 * An unranked member — where EVERYONE lives before GW1 settles, and where new
 * joiners appear mid-season until their first gameweek is scored.
 *
 * Note the different shape: the name arrives split, and `joined_time` exists
 * here and nowhere else. It disappears once the manager moves into
 * `standings.results`, so capture it on first sight.
 */
export const newEntryResultSchema = z.object({
  entry: z.number().int().positive(),
  entry_name: z.string(),
  player_first_name: z.string(),
  player_last_name: z.string(),
  joined_time: z.string(),
});

export const leagueStandingsSchema = z.object({
  league: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    created: z.string(),
    admin_entry: z.number().int().positive().nullable(),
    start_event: z.number().int().default(1),
  }),
  standings: z.object({
    has_next: z.boolean(),
    page: z.number().int(),
    results: z.array(standingsResultSchema),
  }),
  /** Absent on some responses; treat as empty rather than failing. */
  new_entries: z
    .object({
      has_next: z.boolean(),
      page: z.number().int(),
      results: z.array(newEntryResultSchema),
    })
    .optional(),
});

/* ------------------------------------------------------------- history */

export const historyEntrySchema = z.object({
  event: z.number().int().min(1).max(38),
  /** GROSS points, before transfer hits. The most-mishandled field. */
  points: z.number().int(),
  total_points: z.number().int(),
  /** Hits taken, as a POSITIVE number. Subtract it. */
  event_transfers_cost: z.number().int(),
  event_transfers: z.number().int(),
  points_on_bench: z.number().int(),
  overall_rank: z.number().int().nullable(),
});

export const chipPlaySchema = z.object({
  name: z.string(),
  event: z.number().int().min(1).max(38),
});

export const entryHistorySchema = z.object({
  /** Resets every season, so archive before August. Empty before GW1. */
  current: z.array(historyEntrySchema),
  chips: z.array(chipPlaySchema),
});

export type FplHistoryEntry = z.infer<typeof historyEntrySchema>;

/** FPL's internal chip names → the badges the design shows. */
export const CHIP_LABELS: Record<string, string> = {
  wildcard: 'WC',
  freehit: 'FH',
  bboost: 'BB',
  '3xc': 'TC',
  manager: 'AM',
};

/* ------------------------------------------------------------- fixtures */

export const fixtureSchema = z.object({
  id: z.number().int(),
  event: z.number().int().nullable(),
  kickoff_time: z.string().nullable(),
  /** True once the match has kicked off. */
  started: z.boolean(),
  /** Official confirmation. `finished_provisional` flips at the whistle. */
  finished: z.boolean(),
  finished_provisional: z.boolean(),
  /** Elapsed minutes, 0 before kickoff and 90 at the end. */
  minutes: z.number().int(),
  team_h: z.number().int(),
  team_a: z.number().int(),
  team_h_score: z.number().int().nullable(),
  team_a_score: z.number().int().nullable(),
});

export const fixturesSchema = z.array(fixtureSchema);
export type FplFixture = z.infer<typeof fixtureSchema>;

/* ----------------------------------------------------------------- live */

/**
 * Per-player stats during a gameweek.
 *
 * `bonus` is 0 until FPL awards it, which happens after a match is confirmed.
 * `bps` is the raw score the award is derived from, so a live table has to
 * compute provisional bonus from it — see lib/scoring/bonus.ts.
 */
export const liveElementSchema = z.object({
  id: z.number().int(),
  stats: z.object({
    minutes: z.number().int(),
    total_points: z.number().int(),
    bps: z.number().int(),
    bonus: z.number().int(),
  }),
});

export const liveEventSchema = z.object({
  elements: z.array(liveElementSchema),
});

export type FplLiveElement = z.infer<typeof liveElementSchema>;

/* ---------------------------------------------------------------- picks */

export const pickSchema = z.object({
  element: z.number().int(),
  position: z.number().int(),
  /** 0 on the bench, 1 normally, 2 for captain, 3 under Triple Captain. */
  multiplier: z.number().int(),
  is_captain: z.boolean(),
  is_vice_captain: z.boolean(),
});

export const entryPicksSchema = z.object({
  active_chip: z.string().nullable(),
  entry_history: z.object({
    event: z.number().int(),
    event_transfers_cost: z.number().int(),
  }),
  picks: z.array(pickSchema),
});

export type FplPick = z.infer<typeof pickSchema>;

/* ------------------------------------------------- teams and elements */

export const teamSchema = z.object({
  id: z.number().int(),
  short_name: z.string(),
  name: z.string(),
});

/** Only the fields the live table needs; the rest of `elements` is ignored. */
export const elementSchema = z.object({
  id: z.number().int(),
  team: z.number().int(),
});
