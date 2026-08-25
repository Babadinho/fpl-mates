/**
 * The card a winner gets shared as.
 *
 * Built from the same view the page renders, not recomputed — a card posted
 * into the group chat must never disagree with the table it came from.
 *
 * Only ever built for something settled. There is no sharing a result that
 * could still change, which is the whole reason the poller waits for
 * `data_checked` in the first place.
 */
import { APP_NAME } from './app';
import { TIEBREAK_LABELS, type TiebreakKey } from './config';
import { getLeaderboardView, type LeaderboardView, type TableView } from './view';

export type ShareScope = 'weekly' | 'monthly' | 'season';

export interface ShareStat {
  label: string;
  value: string;
  /** Drawn in the figure colour — used for the chip, which is the talking point. */
  accent?: boolean;
}

export interface ShareCard {
  scope: ShareScope;
  /** The season card carries a trophy; the others do not. */
  isSeason: boolean;
  league: string;
  season: string;
  eyebrow: string;
  title: string;
  winner: string;
  team: string;
  points: string;
  pointsLabel: string;
  stats: ShareStat[];
  chaseLabel: string;
  chase: { rank: string; name: string; points: string }[];
  footer: string;
  /** Download name. Carries the period so each card is a separate file. */
  filename: string;
}

/**
 * Badges back to full names. A table column has room for BB and a card does
 * not need to save the characters — "Bench Boost" is the thing people will
 * argue about, so it should say so.
 */
const CHIP_NAMES: Record<string, string> = {
  WC: 'Wildcard',
  FH: 'Free Hit',
  BB: 'Bench Boost',
  TC: 'Triple Captain',
  AM: 'Assistant Manager',
};

/** Tables write an em dash for nothing; a card reads better with the number. */
function orZero(value: string): string {
  return value === '—' || value === '–' || value.trim() === '' ? '0' : value;
}

/** Hits are stored positive and always read as a deduction. */
function deducted(hits: number): string {
  return hits ? `−${hits}` : '0';
}

/**
 * One filename part, reduced to ASCII.
 *
 * Manager names carry apostrophes, accents and occasionally scripts that do
 * not transliterate at all, and this travels in an HTTP header, which is
 * bytes rather than text. Anything that survives none of that drops out.
 */
export function slug(text: string): string {
  return text
    // NFKD splits an accented letter into letter plus mark, so dropping the
    // marks keeps the letter rather than turning the whole name into dashes.
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Joins the parts that survived slugging, so a dropped one leaves no gap. */
function filenameOf(...parts: string[]): string {
  const kept = parts.map(slug).filter(Boolean);
  return `${kept.join('-') || 'winner'}.png`;
}

/** Everyone below the winner, which is the part people actually read. */
function chasing(view: TableView) {
  // Two, not three: the card is about the winner, and a third name pushes the
  // display type down to make room for someone nobody is reading about.
  return view.rows.slice(1, 3).map((r, i) => ({
    rank: String(i + 2).padStart(2, '0'),
    name: r.name,
    points: r.cells[0],
  }));
}

export async function getShareCard(
  scope: ShareScope,
  data?: LeaderboardView,
): Promise<ShareCard | null> {
  const view = data ?? (await getLeaderboardView());

  // Nothing has settled, so there is no winner to put on a card.
  if (!view.hero) return null;

  const league = view.leagueName;
  const season = view.seasonLabel;
  /**
   * Names the rule only when a rule was needed. Listing all of them on a card
   * where nobody tied answers a question nobody asked, and on the monthly and
   * season cards half the rules refer to figures the card does not show.
   */
  const footerFor = (by: TiebreakKey | null | undefined) =>
    by ? `${APP_NAME} · net points · won on ${TIEBREAK_LABELS[by]}` : `${APP_NAME} · net points`;

  if (scope === 'weekly') {
    const latest = view.weekly.at(-1);
    if (!latest || latest.view.rows.length === 0) return null;
    const top = latest.view.rows[0];
    const figures = view.winners?.weekly;

    return {
      scope,
      isSeason: false,
      league,
      season,
      title: `Gameweek ${latest.event} winner`,
      eyebrow: 'Settled · bonus applied',
      winner: top.name,
      team: top.team,
      points: top.cells[0],
      pointsLabel: 'net points',
      // Read from the winner's figures rather than the table's cells, so
      // reordering a column cannot silently relabel a number here.
      stats: [
        { label: 'Gross', value: String(figures?.gross ?? 0) },
        { label: 'Hits', value: deducted(figures?.hits ?? 0) },
        // Follows the table's bench column; a league that hides it there does
        // not want it posted to the group either.
        ...(view.showBench ? [{ label: 'Bench pts', value: String(figures?.bench ?? 0) }] : []),
        ...(top.chip
          ? [{ label: 'Chip', value: CHIP_NAMES[top.chip] ?? top.chip, accent: true }]
          : []),
      ],
      chaseLabel: 'Next best',
      chase: chasing(latest.view),
      footer: footerFor(figures?.decidedBy),
      filename: filenameOf(league, `gw${latest.event}`, 'winner', top.name),
    };
  }

  if (scope === 'monthly') {
    const latest = view.monthly.at(-1);
    if (!latest || latest.view.rows.length === 0) return null;
    const top = latest.view.rows[0];
    const figures = view.winners?.monthly;

    return {
      scope,
      isSeason: false,
      league,
      season,
      // A month still running has a leader, not a winner.
      title: `${latest.label}${latest.view.provisional ? ' so far' : ' winner'}`,
      eyebrow: `${latest.view.meta.split(' · ')[0]}${latest.view.provisional ? ' · in progress' : ' · settled'}`,
      winner: top.name,
      team: top.team,
      points: top.cells[0],
      pointsLabel: 'net points',
      stats: [
        { label: 'Gameweeks', value: String(figures?.gameweeks ?? orZero(top.cells[1])) },
        // The table already rounds the average; no second rule for the card.
        { label: 'Average', value: orZero(top.cells[2]) },
        { label: 'Best GW', value: String(figures?.best ?? 0) },
        { label: 'Hits', value: deducted(figures?.hits ?? 0) },
      ],
      chaseLabel: 'Also in the running',
      chase: chasing(latest.view),
      footer: footerFor(figures?.decidedBy),
      filename: filenameOf(
        league,
        latest.label,
        latest.view.provisional ? 'leader' : 'winner',
        top.name,
      ),
    };
  }

  const rows = view.season.rows;
  if (rows.length === 0) return null;
  const top = rows[0];
  const second = rows[1];

  // Margin is what a leader is asked about, and it is not in any column.
  const margin = second ? Number(top.cells[0]) - Number(second.cells[0]) : 0;

  // Every gameweek settled, so the leader is the winner.
  const complete = (view.weekly.at(-1)?.event ?? 0) >= view.totalGameweeks;

  return {
    scope,
    isSeason: true,
    league,
    season,
    title: complete ? 'Season winner' : 'Season leader',
    eyebrow: complete
      ? `${view.totalGameweeks} of ${view.totalGameweeks} · final`
      : `${view.weekly.at(-1)?.event ?? 0} of ${view.totalGameweeks} played`,
    winner: top.name,
    team: top.team,
    points: top.cells[0],
    pointsLabel: 'total points',
    stats: [
      { label: 'Margin', value: Number.isFinite(margin) ? `+${margin}` : '—' },
      { label: 'Weeks won', value: String(view.winners?.season?.weeksWon ?? 0) },
      { label: 'Best GW', value: String(view.winners?.season?.best ?? orZero(top.cells[2])) },
      { label: 'Hits', value: deducted(view.winners?.season?.hits ?? 0) },
    ],
    chaseLabel: complete ? 'Runners-up' : 'Also in the running',
    chase: chasing(view.season),
    footer: footerFor(view.winners?.season?.decidedBy),
    filename: filenameOf(league, season, 'season', complete ? 'winner' : 'leader', top.name),
  };
}
