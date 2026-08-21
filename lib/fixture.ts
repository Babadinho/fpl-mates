/**
 * One fixture in detail: who scored, who was booked, who is taking the bonus,
 * and who was on the pitch.
 *
 * Fetched when the panel opens rather than shipped with the page — ten
 * fixtures of full stats and lineups is a large payload to send for the one
 * match somebody clicked.
 *
 * What FPL does NOT give: a timestamp on any event. Goals and cards can be
 * listed but never placed on a timeline, and the assists in a match cannot be
 * matched to the goals they made.
 */
import { getConfig } from './config';
import { fetchBootstrap, fetchFixtures, fetchLiveEvent } from './fpl/client';

export interface FixtureEvent {
  club: string;
  /** True for the home side, which the panel colours differently. */
  home: boolean;
  name: string;
  /** Bonus points, or a card colour — whatever the section shows on the right. */
  detail: string;
  /** FPL points the event was worth, when it costs some. Null when it does not. */
  points?: number | null;
}

export interface FixturePlayer {
  name: string;
  /** Whether they started or came on. */
  started: boolean;
  minutes: number;
}

export interface FixtureDetail {
  id: number;
  title: string;
  status: string;
  live: boolean;
  /** Not kicked off: the panel counts down instead of listing nothing. */
  pre: boolean;
  /** ISO kickoff, for that countdown. */
  kickoffAt: string | null;
  kickoffLabel: string;
  home: string;
  away: string;
  goals: FixtureEvent[];
  assists: FixtureEvent[];
  cards: FixtureEvent[];
  /** Kept apart from cards: not a booking, and it flatters the wrong side. */
  ownGoals: FixtureEvent[];
  bonus: FixtureEvent[];
  /** Confirmed once FPL awards it; estimated from BPS until then. */
  bonusConfirmed: boolean;
  lineups: { club: string; players: FixturePlayer[] }[];
}

export async function getFixtureDetail(
  event: number,
  fixtureId: number,
): Promise<FixtureDetail | null> {
  const cfg = getConfig();
  const [bootstrap, fixtures, live] = await Promise.all([
    fetchBootstrap(),
    fetchFixtures(event),
    fetchLiveEvent(event),
  ]);

  const fixture = fixtures.find((f) => f.id === fixtureId);
  if (!fixture) return null;

  const clubOf = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const player = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const stats = new Map(live.elements.map((e) => [e.id, e.stats]));

  /**
   * What an event was worth to the player, read from FPL's own breakdown
   * rather than assumed — a yellow is −1 and a red −3 today, but that is
   * their rule to change.
   */
  const pointsFor = (elementId: number, identifier: string): number | null => {
    const entry = live.elements.find((e) => e.id === elementId);
    const forThis = entry?.explain.find((x) => x.fixture === fixtureId);
    return forThis?.stats.find((s) => s.identifier === identifier)?.points ?? null;
  };

  const home = clubOf.get(fixture.team_h) ?? '???';
  const away = clubOf.get(fixture.team_a) ?? '???';
  const nameOf = (id: number) => player.get(id)?.web_name ?? 'Unknown';

  const group = (identifier: string) =>
    fixture.stats.find((s) => s.identifier === identifier);

  /** Flattens a stat group into rows, home side first as the scoreline reads. */
  const rows = (
    identifier: string,
    detail: (value: number) => string,
    withPoints = false,
  ): FixtureEvent[] => {
    const g = group(identifier);
    if (!g) return [];
    const one = (e: { value: number; element: number }, isHome: boolean) => ({
      club: isHome ? home : away,
      home: isHome,
      name: nameOf(e.element),
      detail: detail(e.value),
      points: withPoints ? pointsFor(e.element, identifier) : null,
    });
    return [...g.h.map((e) => one(e, true)), ...g.a.map((e) => one(e, false))];
  };

  // Real bonus once FPL awards it, which happens after the match is confirmed.
  const awarded = group('bonus');
  const bonusConfirmed = Boolean(awarded && (awarded.h.length > 0 || awarded.a.length > 0));

  const bonus = bonusConfirmed
    ? rows('bonus', (v) => `${v}`)
    : // Before that, the top BPS scores are who the bonus is heading for.
      [...(group('bps')?.h ?? []).map((e) => ({ ...e, home: true })), ...(group('bps')?.a ?? []).map((e) => ({ ...e, home: false }))]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((e) => ({
          club: e.home ? home : away,
          home: e.home,
          name: nameOf(e.element),
          detail: `${e.value} bps`,
        }));

  // `starts` is exact. Inferring from minutes would call anyone substituted
  // off a sub, which is the opposite of what happened.
  const lineupFor = (teamId: number): FixturePlayer[] =>
    bootstrap.elements
      .filter((e) => e.team === teamId && (stats.get(e.id)?.minutes ?? 0) > 0)
      .map((e) => ({
        name: e.web_name,
        started: (stats.get(e.id)?.starts ?? 0) > 0,
        minutes: stats.get(e.id)?.minutes ?? 0,
      }))
      .sort((a, b) => Number(b.started) - Number(a.started) || b.minutes - a.minutes);

  const score =
    fixture.started && fixture.team_h_score !== null && fixture.team_a_score !== null
      ? `${fixture.team_h_score} – ${fixture.team_a_score}`
      : 'v';

  const kickoff = fixture.kickoff_time
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: cfg.rules.timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(fixture.kickoff_time))
    : '';

  return {
    id: fixture.id,
    title: `${home} ${score} ${away}`,
    status: fixture.finished_provisional
      ? 'Full time'
      : fixture.started
        ? `${fixture.minutes}' — in play`
        : kickoff,
    live: fixture.started && !fixture.finished_provisional,
    pre: !fixture.started,
    kickoffAt: fixture.kickoff_time,
    kickoffLabel: kickoff,
    home,
    away,
    goals: rows('goals_scored', (v) => (v > 1 ? `×${v}` : '')),
    assists: rows('assists', (v) => (v > 1 ? `×${v}` : '')),
    cards: [
      ...rows('yellow_cards', () => 'Yellow', true),
      ...rows('red_cards', () => 'Red', true),
    ],
    ownGoals: rows('own_goals', (v) => (v > 1 ? `×${v}` : ''), true),
    bonus,
    bonusConfirmed,
    lineups: [
      { club: home, players: lineupFor(fixture.team_h) },
      { club: away, players: lineupFor(fixture.team_a) },
    ],
  };
}
