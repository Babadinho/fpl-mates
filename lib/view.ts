/**
 * Builds the whole page payload.
 *
 * Reads either the checked-in fixtures (USE_FIXTURES=1) or Postgres, then runs
 * the same scoring functions over either. The client component receives plain
 * data and only decides which tab to show — no fetching, no scoring.
 */
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getConfig, TIEBREAK_LABELS, type TiebreakKey } from './config';
import { getDb } from './db';
import { gameweeks, league, managers as managersTable, gwScores, pollRuns } from './db/schema';
import { mockLeague } from './fixtures/mock';
import { getLiveState, type LiveFixture } from './live';
import { groupByMonth, monthLabel, monthShortLabel } from './scoring/month';
import {
  declareWinner,
  monthlyTable,
  seasonTable,
  weeklyTable,
  type ManagerRef,
  type RankedRow,
  type ScoreRow,
} from './scoring/tables';

export interface UiRow {
  entryId: number;
  rank: string;
  name: string;
  team: string;
  chip: string | null;
  isLeader: boolean;
  shared: boolean;
  /** New to the period this table covers — badged beside the name. */
  isNew: boolean;
  /** Numeric columns, in header order. Three normally, four with bench shown. */
  cells: string[];
}

export interface TableView {
  title: string;
  meta: string;
  /** True when the figures include a gameweek that is still being played. */
  provisional?: boolean;
  headers: string[];
  note: string;
  rows: UiRow[];
}

export interface WinnerFigures {
  gross: number;
  hits: number;
  bench: number;
  gameweeks: number;
  /** Best single gameweek in the range, after costs. */
  best: number;
  /** Gameweeks this manager has won outright or shared. Season card only. */
  weeksWon: number;
  /** The rule that separated first from second, or null if won on points. */
  decidedBy: TiebreakKey | null;
}

export interface HeroCell {
  label: string;
  name: string;
  value: string;
  sub: string;
  /**
   * ISO instant to count down to, shown in place of `sub` once mounted. Set
   * only while a gameweek is waiting to start — the countdown is the point.
   */
  countdownTo?: string | null;
}

export interface LeaderboardView {
  leagueName: string;
  seasonLabel: string;
  /** Public address, for links in messages sent elsewhere. */
  siteUrl: string;
  eyebrow: string;
  showBench: boolean;
  showSearch: boolean;
  /** Auto-refresh interval in seconds, or null when it is off (the default). */
  refreshSeconds: number | null;
  seasonStarted: boolean;
  status: {
    settled: boolean;
    live: boolean;
    /**
     * Anything not final: locked, between fixtures, in play, or waiting on
     * bonus. Stated here rather than re-derived in the page, which had to
     * combine three flags and missed the state a gameweek spends most of its
     * time in.
     */
    provisional: boolean;
    label: string;
    sub: string;
    /**
     * The next deadline to come, already formatted, or null once the last one
     * has passed. Separate from `sub`, which describes the round in progress.
     */
    nextDeadline: string | null;
    polled: string;
  };
  hero: { week: HeroCell; month: HeroCell; season: HeroCell } | null;
  /**
   * The figures behind each hero cell, for the share card.
   *
   * Tables show three columns; a card shows more, and gross, best gameweek and
   * weeks won are not among them. Taken from the same scoring rows the tables
   * are built from, so a shared card cannot disagree with the page.
   */
  winners: {
    weekly: WinnerFigures | null;
    monthly: WinnerFigures | null;
    season: WinnerFigures | null;
  } | null;
  weekly: { event: number; label: string; view: TableView }[];
  monthly: { key: string; label: string; short: string; view: TableView }[];
  season: TableView;
  history: {
    weekly: { gw: string; name: string; pts: number }[];
    monthly: { month: string; name: string; pts: number }[];
    /**
     * What is being waited on, so an empty list can say which gameweek or
     * month is outstanding rather than only that nothing has been won.
     * Both null once the season is over.
     */
    pending: { gameweek: number | null; month: string | null };
  };
  live: {
    event: number;
    /** ISO instant the FPL data was fetched — what "Updated N mins ago" counts from. */
    fetchedAt: string;
    /** ISO deadline of the gameweek being counted down to. */
    nextDeadline: string | null;
    fixtures: LiveFixture[];
    started: number;
    total: number;
    inPlay: boolean;
    /** Provisional table for the gameweek in play, or null before kickoff. */
    view: TableView | null;
    note: string;
    stateLabel: string;
  } | null;
  /** Pre-season: no gameweek has settled, so there is nothing to rank yet. */
  preseason: {
    label: string;
    title: string;
    /** ISO deadline for the client-side countdown. */
    deadline: string | null;
    note: string;
    joined: {
      heading: string;
      meta: string;
      rows: { entryId: number; num: string; name: string; team: string; joined: string; time: string }[];
    };
  } | null;
  whatsappEnabled: boolean;
  totalGameweeks: number;
  /** Active league members. Shown in the header, preseason included. */
  managerCount: number;
}

interface SourceData {
  leagueName: string;
  managers: ManagerRef[];
  /** Roster with join times, for the pre-season "managers in" table. */
  joined: { entryId: number; playerName: string; entryName: string; joinedTime: Date | null }[];
  scores: ScoreRow[];
  weeks: { event: number; deadlineTime: Date; monthKey: string; dataChecked: boolean; finished: boolean }[];
  lastPolled: Date | null;
}

/**
 * How long a page render will wait for live scores before giving up on them.
 *
 * The client retries a refused request five times over about fifteen seconds,
 * which is right for the poller and ruinous here: FPL puts the live endpoint
 * into maintenance for a while after every deadline, and without this the page
 * pays that whole budget on every single request. Measured at 17 seconds.
 *
 * Settled tables do not depend on this, so timing out costs the live figures
 * and nothing else. The next request tries again.
 */
const LIVE_PAGE_BUDGET_MS = 2500;

function withBudget<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('live budget spent')), ms)),
  ]);
}

/**
 * After a failure, stop asking for a moment.
 *
 * FPL's post-deadline maintenance runs for many minutes, so without this every
 * request spends the full budget rediscovering the same 503. Paying it once a
 * minute instead takes the page back to reading Postgres alone.
 *
 * Per-instance, since it is only module memory — a cold start simply tries
 * again, which is the safe direction to be wrong in.
 */
const LIVE_PAUSE_MS = 60_000;
let livePausedUntil = 0;

/** Rows per page. Also the threshold for `SHOW_SEARCH=auto`. */
export const PAGE_SIZE = 25;

const pad = (n: number) => String(n).padStart(2, '0');

export const gwRange = (events: readonly number[]) =>
  events.length === 1 ? `GW ${events[0]}` : `GW ${events[0]}–${events.at(-1)}`;

/**
 * The line under a month's title: which gameweeks it covers, then how far
 * along it is.
 *
 * The span is worth stating because months hold two to six gameweeks. Naming
 * the live one is worth it only when the month holds more than one — saying
 * "GW 1 · GW 1 in play" states the same gameweek twice.
 */
export function monthMeta(
  events: readonly number[],
  liveEvent: number | null,
  complete: boolean,
): string {
  const hasLive = liveEvent !== null && events.includes(liveEvent);
  const state = hasLive
    ? events.length === 1
      ? 'in play'
      : `GW ${liveEvent} in play`
    : complete
      ? 'settled'
      : 'in progress';

  return `${gwRange(events)} · ${state}`;
}

/* ------------------------------------------------------------- sources */

function fromFixtures(timezone: string): SourceData {
  const mock = mockLeague();
  return {
    leagueName: mock.leagueName,
    managers: mock.managers,
    joined: mock.managers.map((m, i) => ({
      entryId: m.entryId,
      playerName: m.playerName,
      entryName: m.entryName,
      joinedTime: new Date(Date.now() - (mock.managers.length - i) * 86_400_000),
    })),
    scores: mock.scores,
    weeks: mock.gameweeks.map((g) => ({
      event: g.event,
      deadlineTime: new Date(g.deadlineTime),
      monthKey: new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit' })
        .format(new Date(g.deadlineTime))
        .slice(0, 7),
      dataChecked: g.event <= mock.played,
      finished: g.event <= mock.played,
    })),
    lastPolled: new Date(Date.now() - 18 * 60 * 1000),
  };
}

async function fromDatabase(): Promise<SourceData> {
  const cfg = getConfig();
  const db = getDb();

  const [weeks, roster, scores, leagueRows, lastRun] = await Promise.all([
    db.select().from(gameweeks).orderBy(asc(gameweeks.event)),
    db.select().from(managersTable).where(eq(managersTable.active, true)),
    db.select().from(gwScores),
    db.select().from(league).where(eq(league.id, cfg.leagueId)).limit(1),
    db
      .select({ finishedAt: pollRuns.finishedAt })
      .from(pollRuns)
      .where(inArray(pollRuns.outcome, ['ok', 'skipped']))
      .orderBy(desc(pollRuns.finishedAt))
      .limit(1),
  ]);

  return {
    leagueName: leagueRows[0]?.name ?? 'FPL Gaffer',
    managers: roster.map((m) => ({
      entryId: m.entryId,
      playerName: m.playerName,
      entryName: m.entryName,
      joinedGw: m.joinedGw,
    })),
    joined: roster.map((m) => ({
      entryId: m.entryId,
      playerName: m.playerName,
      entryName: m.entryName,
      joinedTime: m.joinedTime,
    })),
    scores: scores.map((s) => ({
      entryId: s.entryId,
      event: s.event,
      grossPoints: s.grossPoints,
      transferCost: s.transferCost,
      pointsOnBench: s.pointsOnBench,
      bonus: s.bonus,
      overallRank: s.overallRank,
      chipUsed: s.chipUsed,
    })),
    weeks: weeks.map((w) => ({
      event: w.event,
      deadlineTime: w.deadlineTime,
      monthKey: w.monthKey,
      dataChecked: w.dataChecked,
      finished: w.finished,
    })),
    lastPolled: lastRun[0]?.finishedAt ?? null,
  };
}

/* -------------------------------------------------------------- helpers */

export function toUiRows(
  rows: RankedRow[],
  cells: (row: RankedRow) => string[],
  /**
   * Everyone is on zero, so the order is arbitrary. Numbering it 01, 02, 03
   * would invent a standing that does not exist, and mark somebody leader for
   * being alphabetically lucky.
   */
  unranked = false,
  /**
   * Whether this manager is new to the period the table shows.
   *
   * Scoped per table rather than to the current gameweek: asking "did they
   * join recently?" everywhere marks someone new in a Gameweek 3 table they
   * have a full season of points below.
   */
  isNew: (row: RankedRow) => boolean = () => false,
): UiRow[] {
  return rows.map((row) => ({
    entryId: row.entryId,
    rank: unranked ? '–' : pad(row.rank),
    name: row.manager.playerName,
    team: row.manager.entryName,
    chip: row.chip,
    isLeader: !unranked && row.rank === 1,
    shared: row.shared,
    // An original member is not new in Gameweek 1.
    isNew: row.manager.joinedGw > 1 && isNew(row),
    cells: cells(row),
  }));
}

function relativeTime(date: Date | null): string {
  if (!date) return 'not yet';
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** "2026/27" from the opening deadline. Seasons always straddle two years. */
function seasonLabelFrom(firstDeadline: Date | undefined): string {
  if (!firstDeadline) return '';
  const startYear = firstDeadline.getUTCFullYear();
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function deadlineLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "Friday 21 August" — the long form the pre-season headline uses. */
function longDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * The pre-season view: nothing has settled, so there is no table to rank.
 * Shows when the season starts and who has joined so far.
 */
function buildPreseason(
  source: SourceData,
  nextWeek: SourceData['weeks'][number] | undefined,
  timezone: string,
): NonNullable<LeaderboardView['preseason']> {
  const dayMonth = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: 'numeric',
    month: 'short',
  });
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  });

  // Oldest join first, so the table reads as the order people arrived.
  const ordered = [...source.joined].sort(
    (a, b) => (a.joinedTime?.getTime() ?? 0) - (b.joinedTime?.getTime() ?? 0),
  );

  return {
    label: 'Nothing to show yet',
    title: nextWeek
      ? `Season starts ${longDate(nextWeek.deadlineTime, timezone)}`
      : 'Season not scheduled yet',
    deadline: nextWeek ? nextWeek.deadlineTime.toISOString() : null,
    // The export's copy predates live scoring and said tables only fill in
    // "once Gameweek 1 settles". They now update while matches are played.
    note:
      'Scores update live while matches are played. Every table fills in on ' +
      'its own once FPL confirms the points.',
    joined: {
      heading: 'Managers in',
      meta: `${ordered.length} joined`,
      rows: ordered.map((m, i) => ({
        entryId: m.entryId,
        num: String(i + 1).padStart(2, '0'),
        name: m.playerName,
        team: m.entryName,
        joined: m.joinedTime ? dayMonth.format(m.joinedTime) : '—',
        time: m.joinedTime ? clock.format(m.joinedTime) : '',
      })),
    },
  };
}

/* ---------------------------------------------------------------- build */

export async function getLeaderboardView(): Promise<LeaderboardView> {
  const cfg = getConfig();
  const tz = cfg.rules.timezone;
  const source = cfg.useFixtures ? fromFixtures(tz) : await fromDatabase();

  const options = {
    countPrejoinGws: cfg.rules.countPrejoinGws,
    tiebreakOrder: cfg.rules.tiebreakOrder,
  };

  // Fetched before the tables are built: FPL's own league table counts points
  // from the gameweek in play, so ours does too. Winners still wait for
  // confirmation — only the displayed totals move.
  let liveState: Awaited<ReturnType<typeof getLiveState>> = null;
  if (cfg.live.enabled && !cfg.useFixtures) {
    const upcoming = source.weeks.find((w) => !w.dataChecked);
    if (upcoming && Date.now() >= livePausedUntil) {
      try {
        liveState = await withBudget(getLiveState(upcoming.event), LIVE_PAGE_BUDGET_MS);
        livePausedUntil = 0;
      } catch {
        liveState = null;
        livePausedUntil = Date.now() + LIVE_PAUSE_MS;
      }
    }
  }
  const liveRows = liveState?.rows ?? [];
  const liveEventInPlay = liveRows.length > 0 ? liveState!.event : null;

  const settledWeeks = source.weeks.filter((w) => w.dataChecked).map((w) => w.event);
  const lastSettled = settledWeeks.at(-1) ?? null;
  const seasonStarted = lastSettled !== null;

  const tiebreakNote = `Ties break on ${cfg.rules.tiebreakOrder
    .slice(1)
    .map((k) => TIEBREAK_LABELS[k])
    .join(', then ')}, then the win is shared.`;
  const prejoinNote = cfg.rules.countPrejoinGws
    ? ''
    : ' Managers score only from the gameweek they joined.';

  /* ---- weekly
   *
   * One shape for both the live and the settled table. Bench is a genuine
   * extra column rather than a blanked one, so turning it off removes it.
   */
  const showBench = cfg.site.showBenchColumn;
  const weeklyHeaders = ['Points', 'Bonus', 'Hits', ...(showBench ? ['Bench'] : [])];
  const weeklyCells = (r: RankedRow) => [
    String(r.points),
    r.bonus ? `+${r.bonus}` : '+0',
    r.hits ? `−${r.hits}` : '—',
    ...(showBench ? [String(r.bench)] : []),
  ];

  const weekly = settledWeeks.map((event) => {
    const rows = weeklyTable(source.scores, source.managers, event, options);
    const average = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + r.points, 0) / rows.length)
      : 0;

    return {
      event,
      label: `GW${event}`,
      view: {
        title: `Gameweek ${event}`,
        meta: `${rows.length} manager${rows.length === 1 ? '' : 's'} · avg ${average}`,
        // Matches the live table, so the columns do not rearrange under
        // people the moment a gameweek settles.
        headers: weeklyHeaders,
        // Plain English on purpose — this footnote exists to settle arguments,
        // so it must be both understandable AND accurate. Free transfers bank
        // up to five, and Wildcard/Free Hit weeks cost nothing, so "4 points
        // per transfer" would be wrong often enough to cause the argument.
        note:
          `Points shown are your score after transfer costs. FPL takes 4 points for each ` +
          `transfer beyond your free ones; Wildcard and Free Hit gameweeks cost nothing. ` +
          `${tiebreakNote}${prejoinNote}`,
        rows: toUiRows(rows, (r) => weeklyCells(r), false, (r) => r.manager.joinedGw === event),
      },
    };
  });

  /* ---- monthly */
  const months = groupByMonth(
    source.weeks.filter((w) => w.dataChecked || w.event === liveEventInPlay),
    tz,
  );
  const allMonths = groupByMonth(source.weeks, tz);

  const monthly = [...months.entries()].map(([key, weeksInMonth]) => {
    const events = weeksInMonth.map((w) => w.event);
    const rows = monthlyTable([...source.scores, ...liveRows], source.managers, events, options);
    const scheduled = allMonths.get(key)?.length ?? events.length;
    const complete = events.length === scheduled;
    const hasLive = liveEventInPlay !== null && events.includes(liveEventInPlay);

    return {
      key,
      label: monthLabel(key, tz),
      short: monthShortLabel(key, tz),
      view: {
        title: monthLabel(key, tz),
        provisional: hasLive,
        meta: monthMeta(events, liveEventInPlay, complete),
        headers: ['Points', 'GWs', 'Avg'] as [string, string, string],
        note:
          `A gameweek belongs to the month of its FPL deadline, so months hold unequal numbers ` +
          `of gameweeks — ${monthLabel(key, tz)} holds ${scheduled}. ${tiebreakNote}` +
          (hasLive
            ? ` Includes provisional points from Gameweek ${liveEventInPlay}, which can still change.`
            : ''),
        rows: toUiRows(
          rows,
          (r) => [
            String(r.points),
            String(r.gameweeks),
            String(r.gameweeks ? Math.round(r.points / r.gameweeks) : 0),
          ],
          false,
          // New to the month if the gameweek they joined falls inside it.
          (r) => events.includes(r.manager.joinedGw),
        ),
      },
    };
  });

  /* ---- season */
  const seasonRows = seasonTable(
    [...source.scores.filter((s) => settledWeeks.includes(s.event)), ...liveRows],
    source.managers,
    options,
  );
  const season: TableView = {
    title: 'Season table',
    provisional: liveEventInPlay !== null,
    meta:
      liveEventInPlay !== null
        ? `Including GW ${liveEventInPlay} in play · provisional`
        : seasonStarted
          ? `After GW ${lastSettled} of ${source.weeks.length}`
          : 'Not started',
    headers: ['Total', 'Hits', 'Best GW'],
    note:
      `Mirrors the official FPL standings, recomputed from stored per-gameweek rows so any ` +
      `rule change applies retroactively.${prejoinNote}` +
      (liveEventInPlay !== null
        ? ` Includes provisional points from Gameweek ${liveEventInPlay}, which can still change.`
        : ''),
    rows: toUiRows(
      seasonRows,
      (r) => [String(r.points), r.hits ? `−${r.hits}` : '—', String(r.best)],
      false,
      // Over a whole season "new" has to mean recent, or a Gameweek 3 joiner
      // still carries the badge in May with thirty gameweeks behind them.
      (r) => r.manager.joinedGw > (lastSettled ?? 0) - 4,
    ),
  };

  /* ---- history */
  const nameOf = (entryId: number) =>
    source.managers.find((m) => m.entryId === entryId)?.playerName ?? 'Unknown';

  /** Weekly wins per manager, tallied while walking the weeks below. */
  const weeksWon = new Map<number, number>();

  const history = {
    weekly: [...weekly]
      .reverse()
      .map(({ event }) => {
        const rows = weeklyTable(source.scores, source.managers, event, options);
        const winner = declareWinner(rows, cfg.rules.tiebreakOrder);
        if (winner) weeksWon.set(winner.entryId, (weeksWon.get(winner.entryId) ?? 0) + 1);
        return winner
          ? { gw: `GW ${pad(event)}`, name: nameOf(winner.entryId), pts: winner.points }
          : null;
      })
      .filter((x): x is { gw: string; name: string; pts: number } => x !== null),
    monthly: [...monthly]
      .reverse()
      // Same rule the poller declares on: every gameweek in the month settled.
      // Without it a month still being played reports a winner, and the bot
      // announces one the database has not recorded.
      .filter(({ key }) =>
        source.weeks.filter((w) => w.monthKey === key).every((w) => w.dataChecked),
      )
      .map(({ key, short }) => {
        const events = months.get(key)!.map((w) => w.event);
        const winner = declareWinner(
          monthlyTable(source.scores, source.managers, events, options),
          cfg.rules.tiebreakOrder,
        );
        return winner ? { month: short, name: nameOf(winner.entryId), pts: winner.points } : null;
      })
      .filter((x): x is { month: string; name: string; pts: number } => x !== null),
  };

  /* ---- hero + status */
  // The next gameweek is the first UNSETTLED one, not simply the next future
  // deadline. During a round that has kicked off but not settled, the useful
  // answer is the round we are waiting on.
  const nextWeek = source.weeks.find((w) => !w.dataChecked);
  const provisional = source.weeks.find((w) => w.finished && !w.dataChecked);

  /**
   * The next deadline still to come, which is not `nextWeek`: once a round
   * kicks off, the gameweek being waited on is the one already under way and
   * its deadline is in the past. This is the one people plan transfers around.
   */
  const nextDeadlineWeek = source.weeks.find((w) => w.deadlineTime.getTime() > Date.now());

  /**
   * A deadline has passed with nothing settled yet.
   *
   * Read from the stored deadline and the clock, never from the live fetch.
   * Until a gameweek settles, live data is the only other evidence the season
   * has begun — so deriving this from it means one failed request makes the
   * whole page claim we are back in preseason.
   */
  const gameweekUnderway =
    !seasonStarted && nextWeek !== undefined && nextWeek.deadlineTime.getTime() <= Date.now();

  /**
   * Nothing scored anywhere: a deadline has gone but no gameweek has settled,
   * so every table is a column of zeros.
   *
   * The hero still renders, saying what is being waited for rather than
   * leaving a gap where the winners will be. It runs from the first deadline
   * until the first gameweek settles — most of a weekend.
   */
  // Settled gameweeks only. The season table includes live points, so testing
  // it would make this vanish the moment the first goal went in — which is
  // precisely the gap it exists to fill.
  const nothingScored = settledWeeks.length === 0;

  let hero: LeaderboardView['hero'] = null;
  let winners: LeaderboardView['winners'] = null;

  if (nothingScored && nextWeek) {
    const inMonth = allMonths.get(nextWeek.monthKey)?.length ?? 0;

    hero = {
      week: {
        label: `Gameweek ${nextWeek.event} winner`,
        name: 'To be decided',
        value: liveState
          ? `${liveState.total} fixtures`
          : gameweekUnderway
            ? 'under way'
            : 'not started',
        // "under way" only while something is. `started` counts every match
        // that has kicked off, finished ones included, so on its own it called
        // a match that ended an hour ago under way.
        sub: !liveState
          ? // The deadline has gone, so this is not a squad still being picked.
            gameweekUnderway
            ? 'waiting on FPL for scores'
            : 'waiting for kickoff'
          : liveState.inPlay
            ? `${liveState.started - liveState.finished} under way`
            : liveState.started === 0
              ? 'waiting for kickoff'
              : `${liveState.finished} of ${liveState.total} played`,
        // Only before anything kicks off. Once a match is on, the next
        // unstarted fixture may be days away, and counting down to it beside a
        // game in progress reads as a stopped clock.
        countdownTo:
          liveState && liveState.started === 0
            ? (liveState.fixtures.find((f) => !f.started)?.kickoff ?? null)
            : null,
      },
      month: {
        label: `${monthLabel(nextWeek.monthKey, tz)} winner`,
        name: 'To be decided',
        value: `${inMonth} gameweek${inMonth === 1 ? '' : 's'}`,
        sub: 'nothing scored yet',
      },
      season: {
        label: 'Season leader',
        name: 'To be decided',
        value: `${source.weeks.length} gameweeks`,
        sub: 'nothing scored yet',
      },
    };
  } else if (seasonStarted && lastSettled !== null) {
    const weekRows = weeklyTable(source.scores, source.managers, lastSettled, options);
    const weekWinner = declareWinner(weekRows, cfg.rules.tiebreakOrder);
    const currentMonthKey = source.weeks.find((w) => w.event === lastSettled)!.monthKey;
    const monthEvents = months.get(currentMonthKey)!.map((w) => w.event);
    const monthRows = monthlyTable(source.scores, source.managers, monthEvents, options);
    const monthLeader = monthRows[0];
    const seasonLeader = seasonRows[0];

    const monthWinner = declareWinner(monthRows, cfg.rules.tiebreakOrder);
    const seasonWinner = declareWinner(seasonRows, cfg.rules.tiebreakOrder);

    const figures = (row: RankedRow | undefined | null, by: TiebreakKey | null = null) =>
      row
        ? {
            gross: row.gross,
            hits: row.hits,
            bench: row.bench,
            gameweeks: row.gameweeks,
            best: row.best,
            weeksWon: weeksWon.get(row.entryId) ?? 0,
            decidedBy: by,
          }
        : null;

    // The tiebreak may not pick row zero, so find the row it actually named.
    winners = {
      weekly: figures(
        weekRows.find((r) => r.entryId === weekWinner?.entryId),
        weekWinner?.decidedBy ?? null,
      ),
      monthly: figures(monthLeader, monthWinner?.decidedBy ?? null),
      season: figures(seasonLeader, seasonWinner?.decidedBy ?? null),
    };

    hero = {
      week: {
        label: `Gameweek ${lastSettled} winner`,
        name: weekWinner ? nameOf(weekWinner.entryId) : '—',
        value: weekWinner ? `${weekWinner.points} pts` : '—',
        sub: weekWinner?.decidedBy
          ? `won on ${TIEBREAK_LABELS[weekWinner.decidedBy]}`
          : weekWinner?.tiedWith.length
            ? `shared with ${weekWinner.tiedWith.length} other`
            : 'won outright',
      },
      month: {
        label: `${monthLabel(currentMonthKey, tz)} — leading`,
        name: monthLeader ? nameOf(monthLeader.entryId) : '—',
        value: monthLeader ? `${monthLeader.points} pts` : '—',
        sub: monthLeader ? `across ${monthLeader.gameweeks} gameweeks` : '',
      },
      season: {
        label: 'Season leader',
        name: seasonLeader ? nameOf(seasonLeader.entryId) : '—',
        value: seasonLeader ? `${seasonLeader.points} pts` : '—',
        sub: `after ${lastSettled} of ${source.weeks.length}`,
      },
    };
  }

  /* ---- live gameweek (never from fixtures, and never fatal) */
  let live: LeaderboardView['live'] = null;

  if (cfg.live.enabled && !cfg.useFixtures && nextWeek) {
    try {
      const state = liveState;
      if (state) {
        const table = weeklyTable(state.rows, source.managers, nextWeek.event, options);

        live = {
          event: nextWeek.event,
          fetchedAt: state.fetchedAt.toISOString(),
          nextDeadline: nextWeek.deadlineTime.toISOString(),
          fixtures: state.fixtures,
          started: state.started,
          total: state.total,
          inPlay: state.inPlay,
          stateLabel: state.started === 0
            ? 'Not started'
            : `${state.finished} of ${state.total} played`,
          note:
            'Scores refresh while fixtures are in play. Bonus points are estimated from ' +
            'live match scores and can still change — nothing counts, and no winner is ' +
            'recorded, until FPL confirms the final points.',
          view:
            state.rows.length === 0
              ? null
              : {
                  title: `Gameweek ${nextWeek.event}`,
                  // The one table that is always provisional, and the only one
                  // that never said so — its meta rendered dim like a settled
                  // gameweek's, which is the state it must not be mistaken for.
                  provisional: true,
                  // "In play" only while a match actually is. A gameweek runs
                  // Friday to Monday and spends most of it between fixtures.
                  meta:
                    state.started === 0
                      ? `Teams locked · ${state.total} fixtures to play`
                      : state.inPlay
                        ? `In play · ${state.started} of ${state.total} fixtures started · provisional`
                        : `${state.finished} of ${state.total} played · provisional`,
                  // Only an estimate while a started fixture is still waiting
                  // on its bonus. Once FPL has awarded them all, the column is
                  // the real thing and should not still say otherwise.
                  headers: weeklyHeaders.map((h, i) =>
                    i === 1 && state.bonusPending ? 'Est. bonus' : h,
                  ),
                  note:
                    'Provisional. Bonus is estimated from live match scores and can still ' +
                    'change; no winner is recorded until FPL confirms the final points.',
                  rows: toUiRows(
                    table,
                    (r) => weeklyCells(r),
                    state.started === 0,
                    (r) => r.manager.joinedGw === state.event,
                  ),
                },
        };
      }
    } catch {
      // Live is a nicety. If the API is unreachable or a shape has drifted, the
      // settled tables must still render — this must never take the page down.
      live = null;
    }
  }

  /** A match is on right now. */
  const liveInPlay = live?.inPlay === true && live.view !== null;

  /**
   * The gameweek has begun and has not settled.
   *
   * From the stored deadline, not from the live fetch. Two things would
   * otherwise drop the page back to PRESEASON: FPL taking its live endpoint
   * down for maintenance right after a deadline, and — far more often — the
   * ordinary state of no match being on. A gameweek runs Friday to Monday and
   * is between fixtures for most of it.
   */
  /** Begun, but nothing kicked off yet: squads frozen, table level. */
  const liveLocked = gameweekUnderway && (live?.started ?? 0) === 0;

  /** Begun, matches played, none on at this moment. */
  const liveBetween = gameweekUnderway && !liveLocked && !liveInPlay;

  return {
    live,
    leagueName: cfg.site.leagueName ?? source.leagueName,
    siteUrl: cfg.site.url,
    // A Premier League season always spans two calendar years, so the label is
    // derived from the OPENING year — deriving it from the last loaded
    // gameweek would read "2026/26" whenever only the early rounds are present.
    seasonLabel: cfg.site.seasonLabel ?? seasonLabelFrom(source.weeks[0]?.deadlineTime),
    eyebrow: cfg.site.eyebrow,
    showBench: cfg.site.showBenchColumn,
    // `auto` keeps the box out of the way of a small league, which is the
    // common case — a five-manager table has nothing to search.
    refreshSeconds: cfg.live.autoRefresh ? cfg.live.refreshSeconds : null,
    showSearch:
      cfg.site.searchMode === 'always' ||
      (cfg.site.searchMode === 'auto' && source.managers.length > PAGE_SIZE),
    seasonStarted,
    status: {
      settled: seasonStarted && !provisional && !liveInPlay,
      live: liveInPlay,
      provisional: Boolean(provisional) || liveInPlay || liveLocked || liveBetween,
      label: liveInPlay
        ? `GW ${live!.event} LIVE · PROVISIONAL`
        : provisional
          ? `GW ${provisional.event} PROVISIONAL`
          : liveLocked
            ? // nextWeek, not live — these states exist precisely when the live
              // fetch may have failed, so reading through it would crash.
              `GW ${nextWeek!.event} LOCKED`
            : liveBetween
              ? `GW ${nextWeek!.event} · PROVISIONAL`
              : seasonStarted
                ? `GW ${lastSettled} SETTLED`
                : 'PRESEASON',
      sub: liveInPlay
        ? seasonStarted
          ? `GW ${lastSettled} final · GW ${live!.event} still playing`
          : `GW ${live!.event} in play`
        : provisional
          ? 'waiting for FPL to apply bonus points'
          : liveLocked
            ? `teams locked · ${live ? `${live.total} fixtures to play` : 'waiting on FPL'}`
            : liveBetween
              ? live
                ? `${live.fixtures.filter((f) => f.finished).length} of ${live.total} played · nothing final yet`
                : 'gameweek under way · nothing final yet'
              : !seasonStarted
                ? 'no gameweeks played yet'
            : nextWeek
              ? `GW ${nextWeek.event} deadline ${deadlineLabel(nextWeek.deadlineTime, tz)}`
              : 'season complete',
      nextDeadline: nextDeadlineWeek
        ? `GW ${nextDeadlineWeek.event} deadline ${deadlineLabel(nextDeadlineWeek.deadlineTime, tz)}`
        : null,
      polled: relativeTime(source.lastPolled),
    },
    hero,
    winners,
    weekly,
    monthly,
    season,
    history: {
      ...history,
      pending: {
        gameweek: nextWeek?.event ?? null,
        month: nextWeek ? monthLabel(nextWeek.monthKey, tz) : null,
      },
    },
    // Stands down at the deadline, not once a gameweek settles: otherwise the
    // live table stays hidden behind the joined list for the whole of
    // Gameweek 1.
    //
    // `gameweekUnderway` rather than `live.view`, because the live fetch is
    // the one input here that can fail. Reading it from the clock means an
    // unreachable FPL costs the scores, not the whole page reverting to a
    // panel that announces a start date already in the past.
    preseason:
      seasonStarted || live?.view || gameweekUnderway
        ? null
        : buildPreseason(source, nextWeek, tz),
    whatsappEnabled: cfg.whatsapp !== null,
    totalGameweeks: source.weeks.length,
    managerCount: source.managers.length,
  };
}
