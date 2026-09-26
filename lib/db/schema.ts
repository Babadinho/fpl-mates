/**
 * Schema for stored league data.
 *
 * The design principle worth preserving: `gw_scores` holds RAW per-gameweek
 * rows, not just computed tables. Any scoring rule can then be recalculated
 * retroactively without refetching a single thing from the FPL API.
 *
 * Everything scored is keyed by season as well as gameweek. FPL numbers every
 * season 1 to 38, so without it the next August's Gameweek 1 lands on the
 * last one's row. See lib/season.ts for where the number comes from.
 */
import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * The league itself. One row — this instance serves one league.
 * Persisted so the page can show the real league name without an
 * env override, and without calling the API at request time.
 */
export const league = pgTable('league', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  startEvent: smallint('start_event').notNull().default(1),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Members of the mini-league, as discovered from the standings endpoint.
 *
 * Identity only. What changes season to season — which gameweek counts as
 * their first — lives in `manager_seasons`.
 */
export const managers = pgTable('managers', {
  /** FPL manager ID (`entry` in the standings response). The join key. */
  entryId: integer('entry_id').primaryKey(),
  /** Their team name, e.g. "Bench Warmers FC". */
  entryName: text('entry_name').notNull(),
  /** Their real name. */
  playerName: text('player_name').notNull(),
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

/**
 * The season-scoped half of a manager: which gameweek counts as their first.
 *
 * Kept off `managers` because it changes every season while the person does
 * not. Somebody who joined at Gameweek 10 starts the next season at Gameweek
 * 1, and a single joined_gw on the identity row would carry the 10 across
 * and quietly drop them from nine gameweeks.
 */
export const managerSeasons = pgTable('manager_seasons', {
  season: smallint('season').notNull(),
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  /** The first gameweek whose deadline fell after they joined. */
  joinedGw: smallint('joined_gw').notNull(),
}, (t) => [primaryKey({ columns: [t.season, t.entryId] })]);

/** The 38 gameweeks of one season, mirrored from bootstrap-static. */
export const gameweeks = pgTable('gameweeks', {
  /** The year the season opened: 2026 for 2026/27. */
  season: smallint('season').notNull(),
  /** Gameweek number, 1–38. */
  event: smallint('event').notNull(),
  deadlineTime: timestamp('deadline_time', { withTimezone: true }).notNull(),
  /**
   * Calendar month this gameweek scores into, as `YYYY-MM`, computed from
   * `deadline_time` in the configured TIMEZONE. Stored rather than derived so
   * a timezone change cannot silently reshuffle historical monthly tables.
   */
  monthKey: text('month_key').notNull(),
  /** All matches played. NOT sufficient to settle scores. */
  finished: boolean('finished').notNull().default(false),
  /** Bonus applied and stats final. Gate on THIS, not `finished`. */
  dataChecked: boolean('data_checked').notNull().default(false),
  /** Average score across all FPL managers — context for the weekly post. */
  averageEntryScore: smallint('average_entry_score'),
  /** Set once the poller has written scores for this gameweek. Idempotency guard. */
  processedAt: timestamp('processed_at', { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.season, t.event] }),
  index('gameweeks_month_key_idx').on(t.monthKey),
]);

/** One row per manager per gameweek. The source of truth for all scoring. */
export const gwScores = pgTable('gw_scores', {
  season: smallint('season').notNull(),
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  event: smallint('event').notNull(),
  /** `points` from the history endpoint — GROSS, before transfer hits. */
  grossPoints: smallint('gross_points').notNull(),
  /** `event_transfers_cost`, a positive number. */
  transferCost: smallint('transfer_cost').notNull().default(0),
  /**
   * gross - cost. Denormalised deliberately: it is what every table sorts and
   * sums on, and storing it keeps the scoring queries readable.
   */
  points: smallint('points').notNull(),
  pointsOnBench: smallint('points_on_bench').notNull().default(0),
  /**
   * Bonus inside `grossPoints`, captain multiplier applied.
   *
   * Stored rather than derived: the history endpoint has no bonus field, and
   * recomputing it needs the live feed joined to post-settlement picks. Zero on
   * rows written before this column existed, which is why the backfill exists.
   */
  bonus: smallint('bonus').notNull().default(0),
  /** Overall FPL rank after this gameweek. Needed for the overall_rank tie-break. */
  overallRank: integer('overall_rank'),
  /** FH / BB / TC / WC, or null. Sourced from the `chips` array. */
  chipUsed: text('chip_used'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.season, t.entryId, t.event] }),
  foreignKey({
    columns: [t.season, t.event],
    foreignColumns: [gameweeks.season, gameweeks.event],
    name: 'gw_scores_season_event_fk',
  }).onDelete('cascade'),
  index('gw_scores_season_event_idx').on(t.season, t.event),
]);

/** Declared once a gameweek settles. One row per gameweek. */
export const weeklyWinners = pgTable('weekly_winners', {
  season: smallint('season').notNull(),
  event: smallint('event').notNull(),
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  points: smallint('points').notNull(),
  /**
   * Co-winners when every configured tie-break is exhausted. Empty in the
   * normal case; a shared win is the final rule in the default order.
   */
  tiedWith: integer('tied_with').array().notNull().default([]),
  /** The rule that broke the tie, or null if it was won outright. */
  decidedBy: text('decided_by'),
  declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
  /** Set once announced, so a reprocessed gameweek is never posted twice. */
  postedAt: timestamp('posted_at', { withTimezone: true }),
}, (t) => [
  primaryKey({ columns: [t.season, t.event] }),
  foreignKey({
    columns: [t.season, t.event],
    foreignColumns: [gameweeks.season, gameweeks.event],
    name: 'weekly_winners_season_event_fk',
  }).onDelete('cascade'),
]);

/**
 * Declared once the final gameweek of a calendar month settles.
 *
 * No season column: `month_key` carries the year, so months never collide.
 */
export const monthlyWinners = pgTable('monthly_winners', {
  /** `YYYY-MM`, matching gameweeks.month_key. */
  monthKey: text('month_key').primaryKey(),
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').notNull(),
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

/**
 * A manager's team for one gameweek, cached for the live table.
 *
 * Picks are frozen at the deadline, so they are fetched once per manager per
 * gameweek and read from here on every refresh afterwards. Without this, each
 * live refresh would cost one request per manager instead of one in total.
 */
export const entryPicks = pgTable('entry_picks', {
  season: smallint('season').notNull(),
  entryId: integer('entry_id')
    .notNull()
    .references(() => managers.entryId, { onDelete: 'cascade' }),
  event: smallint('event').notNull(),
  /** Element ids in pick order, positions 1–15. */
  elementIds: integer('element_ids').array().notNull(),
  /** Parallel to elementIds: 0 benched, 1 playing, 2 captain, 3 triple captain. */
  multipliers: smallint('multipliers').array().notNull(),
  /**
   * Pick index of the captain and vice-captain, 1–15.
   *
   * Nullable because rows cached before this existed cannot be backfilled —
   * refetching would cost a request per manager per gameweek to recover a
   * badge. Null means unknown, and the view shows nothing rather than guessing.
   *
   * The captain is usually derivable from the multiplier, but not always: under
   * Bench Boost a benched player still has one, and an automatic substitution
   * can move it. Storing both removes the inference.
   */
  captainIndex: smallint('captain_index'),
  viceIndex: smallint('vice_index'),
  /** FPL's chip name (bboost, 3xc, freehit, wildcard) or null. */
  activeChip: text('active_chip'),
  transferCost: smallint('transfer_cost').notNull().default(0),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.season, t.entryId, t.event] }),
  foreignKey({
    columns: [t.season, t.event],
    foreignColumns: [gameweeks.season, gameweeks.event],
    name: 'entry_picks_season_event_fk',
  }).onDelete('cascade'),
]);
