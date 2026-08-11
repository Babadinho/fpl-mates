/**
 * Schema per technical-brief section 5.
 *
 * The design principle worth preserving: `gw_scores` holds RAW per-gameweek
 * rows, not just computed tables. Any scoring rule can then be recalculated
 * retroactively without refetching a single thing from the FPL API.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * The league itself. One row — this instance serves one league (section 11,
 * item 4). Persisted so the page can show the real league name without an
 * env override, and without calling the API at request time.
 */
export const league = pgTable('league', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  startEvent: smallint('start_event').notNull().default(1),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Members of the mini-league, as discovered from the standings endpoint. */
export const managers = pgTable('managers', {
  /** FPL manager ID (`entry` in the standings response). The join key. */
  entryId: integer('entry_id').primaryKey(),
  /** Their team name, e.g. "Bench Warmers FC". */
  entryName: text('entry_name').notNull(),
  /** Their real name. */
  playerName: text('player_name').notNull(),
  /**
   * First gameweek that counts for them, derived from `joined_time` — the
   * first gameweek whose deadline falls after they joined. See gotcha 5.
   */
  joinedGw: smallint('joined_gw').notNull(),
  /**
   * When they joined the league. Supplied by the API only while a manager is
   * unranked (`new_entries`); it is gone once they appear in the standings,
   * so it is captured on first sight and never overwritten.
   */
  joinedTime: timestamp('joined_time', { withTimezone: true }),
  /** False once they leave the league; their historical rows are kept. */
  active: boolean('active').notNull().default(true),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The 38 gameweeks, mirrored from bootstrap-static. */
export const gameweeks = pgTable('gameweeks', {
  /** Gameweek number, 1–38. */
  event: smallint('event').primaryKey(),
  deadlineTime: timestamp('deadline_time', { withTimezone: true }).notNull(),
  /**
   * Calendar month this gameweek scores into, as `YYYY-MM`, computed from
   * `deadline_time` in the configured TIMEZONE. Stored rather than derived so
   * a timezone change cannot silently reshuffle historical monthly tables.
   */
  monthKey: text('month_key').notNull(),
  /** All matches played. NOT sufficient to settle scores. */
  finished: boolean('finished').notNull().default(false),
  /** Bonus applied and stats final. THIS is the flag to gate on (gotcha 2). */
  dataChecked: boolean('data_checked').notNull().default(false),
  /** Average score across all FPL managers — context for the weekly post. */
  averageEntryScore: smallint('average_entry_score'),
  /** Set once the poller has written scores for this gameweek. Idempotency guard. */
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (t) => [index('gameweeks_month_key_idx').on(t.monthKey)]);

/** One row per manager per gameweek. The source of truth for all scoring. */
export const gwScores = pgTable('gw_scores', {
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  event: smallint('event')
    .notNull()
    .references(() => gameweeks.event, { onDelete: 'cascade' }),
  /** `points` from the history endpoint — GROSS, before transfer hits. */
  grossPoints: smallint('gross_points').notNull(),
  /** `event_transfers_cost`, a positive number. */
  transferCost: smallint('transfer_cost').notNull().default(0),
  /**
   * gross - cost. Denormalised deliberately: it is what every table sorts and
   * sums on, and storing it keeps the scoring queries readable (section 5b).
   */
  netPoints: smallint('net_points').notNull(),
  pointsOnBench: smallint('points_on_bench').notNull().default(0),
  /** Overall FPL rank after this gameweek. Needed for the overall_rank tie-break. */
  overallRank: integer('overall_rank'),
  /** FH / BB / TC / WC, or null. Sourced from the `chips` array. */
  chipUsed: text('chip_used'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.entryId, t.event] }),
  index('gw_scores_event_idx').on(t.event),
]);

/** Declared once a gameweek settles. One row per gameweek. */
export const weeklyWinners = pgTable('weekly_winners', {
  event: smallint('event')
    .primaryKey()
    .references(() => gameweeks.event, { onDelete: 'cascade' }),
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  netPoints: smallint('net_points').notNull(),
  /**
   * Co-winners when every configured tie-break is exhausted. Empty in the
   * normal case; a shared win is the final rule in the default order.
   */
  tiedWith: integer('tied_with').array().notNull().default([]),
  /** The rule that broke the tie, or null if it was won outright. */
  decidedBy: text('decided_by'),
  declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Declared once the final gameweek of a calendar month settles. */
export const monthlyWinners = pgTable('monthly_winners', {
  /** `YYYY-MM`, matching gameweeks.month_key. */
  monthKey: text('month_key').primaryKey(),
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  totalNetPoints: integer('total_net_points').notNull(),
  /** How many gameweeks fell in this month — they are not equal (2 to 6). */
  gameweekCount: smallint('gameweek_count').notNull(),
  tiedWith: integer('tied_with').array().notNull().default([]),
  decidedBy: text('decided_by'),
  declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Bookkeeping for the poller: when it last ran and whether it succeeded. */
export const pollRuns = pgTable('poll_runs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  /** ok | skipped | error — skipped means data_checked was false. */
  outcome: text('outcome'),
  detail: text('detail'),
});
