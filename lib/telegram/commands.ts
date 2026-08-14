import { getLeaderboardView } from '../view';
import {
  formatFixtures,
  formatGameweek,
  formatHelp,
  formatMonth,
  formatNext,
  formatSeason,
  formatWinners,
} from './format';

/** Strips the @botname Telegram appends in groups. */
function parse(text: string): { command: string; argument?: string } {
  const [raw, ...rest] = text.trim().split(/\s+/);
  return { command: raw.split('@')[0].toLowerCase(), argument: rest[0] };
}

/** Returns null for anything that is not a command we answer. */
export async function respondTo(text: string): Promise<string | null> {
  const { command, argument } = parse(text);
  if (!command.startsWith('/')) return null;

  const data = await getLeaderboardView();

  switch (command) {
    case '/start':
    case '/help':
      return formatHelp();
    case '/table':
    case '/season':
      return formatSeason(data);
    case '/gw':
    case '/gameweek':
      return formatGameweek(data, argument ? Number(argument) : undefined);
    case '/month':
    case '/monthly':
      return formatMonth(data, argument);
    case '/winners':
      return formatWinners(data);
    case '/fixtures':
    case '/live':
      return formatFixtures(data);
    case '/next':
      return formatNext(data);
    default:
      return null;
  }
}
