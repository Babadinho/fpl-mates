/**
 * Builds the whole page payload.
 *
 * Reads either the checked-in fixtures (USE_FIXTURES=1) or Postgres, then runs
 * the same scoring functions over either. The client component receives plain
 * data and only decides which tab to show — no fetching, no scoring.
 */
import { asc, eq } from 'drizzle-orm';
import { getConfig, TIEBREAK_LABELS } from './config';
import { getDb } from './db';
import { gameweeks, league, managers as managersTable, gwScores } from './db/schema';
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
  c0: string;
  c1: string;
  c2: string;
}

export interface TableView {
  title: string;
  meta: string;
  headers: [string, string, string];
  note: string;
  rows: UiRow[];
}

export interface HeroCell {
  label: string;
  name: string;
  value: string;
  sub: string;
}

export interface LeaderboardView {
  leagueName: string;
  seasonLabel: string;
  eyebrow: string;
  showBench: boolean;
  showSearch: boolean;
  seasonStarted: boolean;
  status: { settled: boolean; live: boolean; label: string; sub: string; polled: string };
  hero: { week: HeroCell; month: HeroCell; season: HeroCell } | null;
  weekly: { event: number; label: string; view: TableView }[];
  monthly: { key: string; label: string; short: string; view: TableView }[];
  season: TableView;
  history: {
    weekly: { gw: string; name: string; pts: number }[];
    monthly: { month: string; name: string; pts: number }[];
  };
  live: {
    event: number;
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
      rows: { num: string; name: string; team: string; joined: string; time: string }[];
    };
  } | null;
  whatsappEnabled: boolean;
  totalGameweeks: number;
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

/** Rows per page. Also the threshold for `SHOW_SEARCH=auto`. */
export const PAGE_SIZE = 25;

const pad = (n: number) => String(n).padStart(2, '0');

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

  const [weeks, roster, scores, leagueRows] = await Promise.all([
    db.select().from(gameweeks).orderBy(asc(gameweeks.event)),
    db.select().from(managersTable).where(eq(managersTable.active, true)),
    db.select().from(gwScores),
    db.select().from(league).where(eq(league.id, cfg.leagueId)).limit(1),
  ]);

  const processed = weeks.map((w) => w.processedAt).filter((d): d is Date => d !== null);

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
    lastPolled: processed.length ? new Date(Math.max(...processed.map((d) => d.getTime()))) : null,
  };
}

/* -------------------------------------------------------------- helpers */

function toUiRows(rows: RankedRow[], cells: (row: RankedRow) => [string, string, string]): UiRow[] {
  return rows.map((row) => ({
    entryId: row.entryId,
    rank: pad(row.rank),
    name: row.manager.playerName,
    team: row.manager.entryName,
    chip: row.chip,
    isLeader: row.rank === 1,
    shared: row.shared,
    c0: cells(row)[0],
    c1: cells(row)[1],
    c2: cells(row)[2],
  }));
}

function relativeTime(date: Date | null): string {
  if (!date) return 'never';
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
    note:
      'Weekly, monthly and season tables fill in automatically once Gameweek 1 ' +
      'settles. Nobody has to enter anything.',
    joined: {
      heading: 'Managers in',
      meta: `${ordered.length} joined`,
      rows: ordered.map((m, i) => ({
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

  /* ---- weekly */
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
        headers: ['Points', 'Hits', 'Bench'] as [string, string, string],
        // Plain English on purpose — this footnote exists to settle arguments,
        // so it must be both understandable AND accurate. Free transfers bank
        // up to five, and Wildcard/Free Hit weeks cost nothing, so "4 points
        // per transfer" would be wrong often enough to cause the argument.
        note:
          `Points shown are your score after transfer costs. FPL takes 4 points for each ` +
          `transfer beyond your free ones; Wildcard and Free Hit gameweeks cost nothing. ` +
          `${tiebreakNote}${prejoinNote}`,
        rows: toUiRows(rows, (r) => [
          String(r.points),
          r.hits ? `−${r.hits}` : '—',
          cfg.site.showBenchColumn ? String(r.bench) : '—',
        ]),
      },
    };
  });

  /* ---- monthly */
  const months = groupByMonth(
    source.weeks.filter((w) => w.dataChecked),
    tz,
  );
  const allMonths = groupByMonth(source.weeks, tz);

  const monthly = [...months.entries()].map(([key, weeksInMonth]) => {
    const events = weeksInMonth.map((w) => w.event);
    const rows = monthlyTable(source.scores, source.managers, events, options);
    const scheduled = allMonths.get(key)?.length ?? events.length;
    const complete = events.length === scheduled;

    return {
      key,
      label: monthLabel(key, tz),
      short: monthShortLabel(key, tz),
      view: {
        title: monthLabel(key, tz),
        meta: `GW ${events[0]}–${events.at(-1)} · ${complete ? 'settled' : 'in progress'}`,
        headers: ['Points', 'GWs', 'Avg'] as [string, string, string],
        note:
          `A gameweek belongs to the month of its FPL deadline, so months hold unequal numbers ` +
          `of gameweeks — ${monthLabel(key, tz)} holds ${scheduled}. ${tiebreakNote}`,
        rows: toUiRows(rows, (r) => [
          String(r.points),
          String(r.gameweeks),
          String(r.gameweeks ? Math.round(r.points / r.gameweeks) : 0),
        ]),
      },
    };
  });

  /* ---- season */
  const seasonRows = seasonTable(
    source.scores.filter((s) => settledWeeks.includes(s.event)),
    source.managers,
    options,
  );
  const season: TableView = {
    title: 'Season table',
    meta: seasonStarted
      ? `After GW ${lastSettled} of ${source.weeks.length}`
      : 'Not started',
    headers: ['Total', 'Hits', 'Best GW'],
    note:
      `Mirrors the official FPL standings, recomputed from stored per-gameweek rows so any ` +
      `rule change applies retroactively.${prejoinNote}`,
    rows: toUiRows(seasonRows, (r) => [String(r.points), r.hits ? `−${r.hits}` : '—', String(r.best)]),
  };

  /* ---- history */
  const nameOf = (entryId: number) =>
    source.managers.find((m) => m.entryId === entryId)?.playerName ?? 'Unknown';

  const history = {
    weekly: [...weekly]
      .reverse()
      .map(({ event }) => {
        const rows = weeklyTable(source.scores, source.managers, event, options);
        const winner = declareWinner(rows, cfg.rules.tiebreakOrder);
        return winner
          ? { gw: `GW ${pad(event)}`, name: nameOf(winner.entryId), pts: winner.points }
          : null;
      })
      .filter((x): x is { gw: string; name: string; pts: number } => x !== null),
    monthly: [...monthly]
      .reverse()
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

  let hero: LeaderboardView['hero'] = null;
  if (seasonStarted && lastSettled !== null) {
    const weekWinner = declareWinner(
      weeklyTable(source.scores, source.managers, lastSettled, options),
      cfg.rules.tiebreakOrder,
    );
    const currentMonthKey = source.weeks.find((w) => w.event === lastSettled)!.monthKey;
    const monthEvents = months.get(currentMonthKey)!.map((w) => w.event);
    const monthRows = monthlyTable(source.scores, source.managers, monthEvents, options);
    const monthLeader = monthRows[0];
    const seasonLeader = seasonRows[0];

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
      const state = await getLiveState(nextWeek.event);
      if (state) {
        const table = weeklyTable(state.rows, source.managers, nextWeek.event, options);

        live = {
          event: nextWeek.event,
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
            state.started === 0
              ? null
              : {
                  title: `Gameweek ${nextWeek.event}`,
                  meta: `In play · ${state.started} of ${state.total} fixtures started · provisional`,
                  headers: ['Points', 'Est. bonus', 'Hits'],
                  note:
                    'Provisional. Bonus is estimated from live match scores and can still ' +
                    'change; no winner is recorded until FPL confirms the final points.',
                  rows: toUiRows(table, (r) => [
                    String(r.points),
                    `+${state.provisionalBonus.get(r.entryId) ?? 0}`,
                    r.hits ? `−${r.hits}` : '—',
                  ]),
                },
        };
      }
    } catch {
      // Live is a nicety. If the API is unreachable or a shape has drifted, the
      // settled tables must still render — this must never take the page down.
      live = null;
    }
  }

  const liveInPlay = live?.inPlay === true && live.view !== null;

  return {
    live,
    leagueName: cfg.site.leagueName ?? source.leagueName,
    // A Premier League season always spans two calendar years, so the label is
    // derived from the OPENING year — deriving it from the last loaded
    // gameweek would read "2026/26" whenever only the early rounds are present.
    seasonLabel: cfg.site.seasonLabel ?? seasonLabelFrom(source.weeks[0]?.deadlineTime),
    eyebrow: cfg.site.eyebrow,
    showBench: cfg.site.showBenchColumn,
    // `auto` keeps the box out of the way of a small league, which is the
    // common case — a five-manager table has nothing to search.
    showSearch:
      cfg.site.searchMode === 'always' ||
      (cfg.site.searchMode === 'auto' && source.managers.length > PAGE_SIZE),
    seasonStarted,
    status: {
      settled: seasonStarted && !provisional && !liveInPlay,
      live: liveInPlay,
      label: liveInPlay
        ? `GW ${live!.event} LIVE · PROVISIONAL`
        : provisional
          ? `GW ${provisional.event} PROVISIONAL`
          : seasonStarted
            ? `GW ${lastSettled} SETTLED`
            : 'PRESEASON',
      sub: liveInPlay
        ? seasonStarted
          ? `GW ${lastSettled} final · GW ${live!.event} still playing`
          : `GW ${live!.event} in play`
        : provisional
          ? 'waiting for FPL to apply bonus points'
          : !seasonStarted
            ? 'no gameweeks played yet'
            : nextWeek
              ? `GW ${nextWeek.event} deadline ${deadlineLabel(nextWeek.deadlineTime, tz)}`
              : 'season complete',
      polled: relativeTime(source.lastPolled),
    },
    hero,
    weekly,
    monthly,
    season,
    history,
    preseason: seasonStarted ? null : buildPreseason(source, nextWeek, tz),
    whatsappEnabled: cfg.whatsapp !== null,
    totalGameweeks: source.weeks.length,
  };
}
