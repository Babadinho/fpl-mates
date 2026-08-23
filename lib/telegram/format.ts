/**
 * Renders the same view the web page uses as Telegram messages.
 *
 * Pure and I/O-free, like the scoring modules, so the output can be tested
 * without a bot token.
 *
 * Rows use inline code, never fenced blocks. Both are monospace, but Telegram
 * offers a COPY CODE bar only for fences — full width on mobile, which swamps
 * a short table.
 */
import type { LeaderboardView, TableView } from '../view';

/** Telegram rejects anything longer outright. */
export const MAX_MESSAGE = 4096;
const ROW_LIMIT = 15;

/** Telegram's MarkdownV2 needs these escaped anywhere they appear. */
const MARKDOWN_SPECIAL = new Set([
  '_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-',
  '=', '|', '{', '}', '.', '!', String.fromCharCode(92),
]);

function escape(text: string): string {
  return [...text].map((c) => (MARKDOWN_SPECIAL.has(c) ? String.fromCharCode(92) + c : c)).join('');
}

/**
 * One line per manager, each wrapped in inline code.
 *
 * Inline code is monospace, so columns line up, but Telegram only offers a
 * COPY CODE bar for fenced blocks — which on mobile is a full-width button
 * that swamps a short table. Text inside a code entity also needs no
 * MarkdownV2 escaping, so names with dots arrive clean.
 */
function pad(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

/** Backticks would end the code entity early. */
function codeSafe(text: string): string {
  return text.replace(/`/g, "'");
}

/**
 * Wraps a row as inline code — monospace, but no COPY CODE bar.
 * Trailing padding is trimmed: it sits inside the code span and shows as a
 * stretched grey block on an empty column.
 */
function codeRow(line: string): string {
  return '`' + codeSafe(line.trimEnd()) + '`';
}

function rowsToLines(view: TableView): string[] {
  const shown = view.rows.slice(0, ROW_LIMIT);
  const nameWidth = Math.max(...shown.map((r) => Math.min(r.name.length, 16)), 6);

  // Hits by name, not position: it is the column that explains a low score,
  // and the table reorders its columns depending on what is being shown.
  const hits = view.headers.indexOf('Hits');

  const lines = shown.map((r) => {
    const cell = hits > 0 ? r.cells[hits] : undefined;
    const extra = cell && cell !== '—' ? cell.padStart(4) : '';
    return codeRow(
      `${String(Number(r.rank)).padStart(2)}  ${pad(r.name, nameWidth)}  ${r.cells[0].padStart(3)}${extra}`,
    );
  });

  if (view.rows.length > shown.length) {
    lines.push(escape(`… and ${view.rows.length - shown.length} more`));
  }

  return lines;
}

function table(view: TableView, siteUrl: string): string {
  return [
    `*${escape(view.title)}*`,
    escape(view.meta),
    '',
    ...rowsToLines(view),
    '',
    `[Full table](${siteUrl})`,
  ].join('\n');
}

export function formatSeason(data: LeaderboardView): string {
  return table(data.season, data.siteUrl);
}

export function formatGameweek(data: LeaderboardView, event?: number): string {
  const wanted =
    event === undefined
      ? (data.live?.view ?? data.weekly.at(-1)?.view)
      : data.weekly.find((w) => w.event === event)?.view ??
        (data.live?.event === event ? data.live.view : undefined);

  if (!wanted) {
    const known = data.weekly.map((w) => w.event);
    return known.length
      ? escape(`No gameweek ${event ?? ''}. Try ${known[0]}–${known.at(-1)}.`)
      : escape('No gameweek has been scored yet.');
  }

  return table(wanted, data.siteUrl);
}

export function formatMonth(data: LeaderboardView, name?: string): string {
  const wanted = name
    ? data.monthly.find((m) => m.label.toLowerCase().startsWith(name.toLowerCase()))
    : data.monthly.at(-1);

  if (!wanted) {
    return escape(
      data.monthly.length
        ? `No month called "${name}". Try ${data.monthly.map((m) => m.short).join(', ')}.`
        : 'No month has been scored yet.',
    );
  }

  return table(wanted.view, data.siteUrl);
}

export function formatWinners(data: LeaderboardView): string {
  const { weekly, monthly } = data.history;

  if (weekly.length === 0 && monthly.length === 0) {
    return escape('Nothing has been won yet — the season has not started.');
  }

  const parts = ['*Winners*'];
  const nameWidth = Math.max(
    ...[...weekly, ...monthly].map((w) => Math.min(w.name.length, 16)),
    6,
  );

  if (weekly.length) {
    parts.push(
      '',
      '_Weekly_',
      ...weekly
        .slice(0, 12)
        .map((w) => codeRow(`${w.gw.padEnd(5)}  ${pad(w.name, nameWidth)}  ${String(w.pts).padStart(3)}`)),
    );
  }

  if (monthly.length) {
    parts.push(
      '',
      '_Monthly_',
      ...monthly.map((m) =>
        codeRow(`${m.month.padEnd(5)}  ${pad(m.name, nameWidth)}  ${String(m.pts).padStart(3)}`),
      ),
    );
  }

  parts.push('', `[Full history](${data.siteUrl})`);
  return parts.join('\n');
}

export function formatFixtures(data: LeaderboardView): string {
  // Also absent in demo mode, where there are no real fixtures to fetch —
  // "switched off" would wrongly imply somebody disabled a setting.
  if (!data.live) return escape('No fixtures to show.');

  const lines = data.live.fixtures.map((f) =>
    codeRow(`${f.home.padEnd(4)}${f.score.padStart(10)}  ${f.away.padEnd(4)}${f.clock.padStart(4)}`),
  );

  return [
    `*Gameweek ${data.live.event}*`,
    escape(data.live.stateLabel),
    '',
    ...lines,
    '',
    `[Live table](${data.siteUrl})`,
  ].join('\n');
}

export function formatNext(data: LeaderboardView): string {
  // Before the season the status strip reads "no gameweeks played yet", which
  // is fine beside the page's hero but useless from a command called /next.
  const sub = data.preseason ? data.preseason.title : data.status.sub;
  return [`*${escape(data.leagueName)}*`, escape(data.status.label), escape(sub)].join('\n');
}

export function formatHelp(): string {
  return [
    '*Commands*',
    '',
    `/table — ${escape('season standings')}`,
    `/gw — ${escape('a gameweek, latest if omitted')}`,
    `/month — ${escape('a month, current if omitted')}`,
    `/winners — ${escape('weekly and monthly winners')}`,
    `/fixtures — ${escape('fixtures and live scores')}`,
    `/next — ${escape('next deadline')}`,
  ].join('\n');
}

/** Posted automatically when a gameweek is confirmed. */
export function formatSettled(data: LeaderboardView, event: number): string {
  const view = data.weekly.find((w) => w.event === event)?.view;
  if (!view) return '';

  const winner = view.rows[0];
  const shared = view.rows.filter((r) => r.rank === winner.rank);

  const headline =
    shared.length > 1
      ? `${shared.map((r) => r.name).join(' and ')} share Gameweek ${event}`
      : `${winner.name} wins Gameweek ${event}`;

  return [
    `*${escape(headline)}*`,
    escape(`${winner.cells[0]} points`),
    '',
    ...rowsToLines(view),
    '',
    `[Full table](${data.siteUrl})`,
  ].join('\n');
}

/** Telegram rejects over-long messages outright, so never send one. */
export function clamp(message: string): string {
  return message.length <= MAX_MESSAGE ? message : `${message.slice(0, MAX_MESSAGE - 4)}\n…`;
}
