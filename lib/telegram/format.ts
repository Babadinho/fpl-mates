/**
 * Renders the same view the web page uses as Telegram messages.
 *
 * Pure and I/O-free, like the scoring modules, so the output can be tested
 * without a bot token.
 */
import type { LeaderboardView, TableView, UiRow } from '../view';

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

function pad(text: string, width: number): string {
  return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

/**
 * A fixed-width block so columns line up. Long leagues are cut rather than
 * paginated — someone wanting rank 87 is better served by the website.
 */
function rowsToBlock(rows: UiRow[], siteUrl: string): string {
  const shown = rows.slice(0, ROW_LIMIT);
  const nameWidth = Math.max(...shown.map((r) => Math.min(r.name.length, 18)), 4);

  const lines = shown.map((r) => `${r.rank}  ${pad(r.name, nameWidth)}  ${r.c0.padStart(4)}`);

  if (rows.length > shown.length) {
    lines.push(`… and ${rows.length - shown.length} more at ${siteUrl}`);
  }

  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

function table(view: TableView, siteUrl: string): string {
  return [`*${escape(view.title)}*`, escape(view.meta), rowsToBlock(view.rows, siteUrl)].join('\n');
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

  const parts = [`*Winners*`];

  if (weekly.length) {
    const lines = weekly.slice(0, 12).map((w) => `${w.gw}  ${pad(w.name, 18)}  ${String(w.pts).padStart(4)}`);
    parts.push('_Weekly_', `\`\`\`\n${lines.join('\n')}\n\`\`\``);
  }

  if (monthly.length) {
    const lines = monthly.map((m) => `${m.month}  ${pad(m.name, 18)}  ${String(m.pts).padStart(4)}`);
    parts.push('_Monthly_', `\`\`\`\n${lines.join('\n')}\n\`\`\``);
  }

  return parts.join('\n');
}

export function formatFixtures(data: LeaderboardView): string {
  if (!data.live) return escape('Live scores are switched off.');

  const lines = data.live.fixtures.map((f) => {
    const clock = f.clock ? ` ${f.clock}` : '';
    return `${f.home.padEnd(4)}${f.score.padStart(11)}  ${f.away}${clock}`;
  });

  return [
    `*Gameweek ${data.live.event}*`,
    escape(data.live.stateLabel),
    `\`\`\`\n${lines.join('\n')}\n\`\`\``,
  ].join('\n');
}

export function formatNext(data: LeaderboardView): string {
  return [`*${escape(data.leagueName)}*`, escape(data.status.label), escape(data.status.sub)].join('\n');
}

export function formatHelp(): string {
  return [
    '*Commands*',
    '```',
    '/table      season standings',
    '/gw [n]     a gameweek, latest if omitted',
    '/month [x]  a month, current if omitted',
    '/winners    weekly and monthly winners',
    '/fixtures   fixtures and live scores',
    '/next       next deadline',
    '```',
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

  return [`*${escape(headline)}*`, escape(`${winner.c0} points`), rowsToBlock(view.rows, data.siteUrl)].join('\n');
}

/** Telegram rejects over-long messages outright, so never send one. */
export function clamp(message: string): string {
  return message.length <= MAX_MESSAGE ? message : `${message.slice(0, MAX_MESSAGE - 4)}\n…`;
}
