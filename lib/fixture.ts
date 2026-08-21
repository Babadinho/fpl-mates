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
import { positionOf } from './fpl/schemas';

export interface FixtureEvent {
  club: string;
  /** True for the home side, which the panel colours differently. */
  home: boolean;
  name: string;
  /** Bonus points, or a card colour — whatever the section shows on the right. */
  detail: string;
}

export interface FixturePlayer {
  name: string;
  role: string;
  minutes: number;
}

export interface FixtureDetail {
  id: number;
  title: string;
  status: string;
  live: boolean;
  home: string;
  away: string;
  goals: FixtureEvent[];
  assists: FixtureEvent[];
  cards: FixtureEvent[];
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

  const home = clubOf.get(fixture.team_h) ?? '???';
  const away = clubOf.get(fixture.team_a) ?? '???';
  const nameOf = (id: number) => player.get(id)?.web_name ?? 'Unknown';

  const group = (identifier: string) =>
    fixture.stats.find((s) => s.identifier === identifier);

  /** Flattens a stat group into rows, home side first as the scoreline reads. */
  const rows = (identifier: string, detail: (value: number) => string): FixtureEvent[] => {
    const g = group(identifier);
    if (!g) return [];
    return [
      ...g.h.map((e) => ({ club: home, home: true, name: nameOf(e.element), detail: detail(e.value) })),
      ...g.a.map((e) => ({ club: away, home: false, name: nameOf(e.element), detail: detail(e.value) })),
    ];
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

  const lineupFor = (teamId: number): FixturePlayer[] =>
    bootstrap.elements
      .filter((e) => e.team === teamId && (stats.get(e.id)?.minutes ?? 0) > 0)
      .map((e) => ({
        name: e.web_name,
        role: positionOf(e.element_type),
        minutes: stats.get(e.id)?.minutes ?? 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);

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
    status: fixture.finished
      ? 'Full time'
      : fixture.started
        ? `${fixture.minutes}' — in play`
        : kickoff,
    live: fixture.started && !fixture.finished,
    home,
    away,
    goals: rows('goals_scored', (v) => (v > 1 ? `×${v}` : '')),
    assists: rows('assists', (v) => (v > 1 ? `×${v}` : '')),
    cards: [
      ...rows('yellow_cards', () => 'Yellow'),
      ...rows('red_cards', () => 'Red'),
      ...rows('own_goals', (v) => (v > 1 ? `Own goal ×${v}` : 'Own goal')),
    ],
    bonus,
    bonusConfirmed,
    lineups: [
      { club: home, players: lineupFor(fixture.team_h) },
      { club: away, players: lineupFor(fixture.team_a) },
    ],
  };
}
