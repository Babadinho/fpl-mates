/**
 * One manager's squad for one gameweek.
 *
 * Fetched on demand rather than shipped with the page: a 500-member league
 * would mean 7,500 player rows in the initial payload to show the one squad
 * somebody clicked. Picks freeze at the deadline, so the first fetch is also
 * the last — everything after it reads Postgres.
 */
import { and, eq } from 'drizzle-orm';
import { getConfig } from './config';
import { getDb } from './db';
import { entryPicks, gameweeks, managers } from './db/schema';
import { mockLeague } from './fixtures/mock';
import { mockSquad } from './fixtures/squads';
import { fetchBootstrap, fetchFixtures, fetchLiveEvent } from './fpl/client';
import { CHIP_LABELS, positionOf } from './fpl/schemas';

/** How a player's gameweek is going, which decides how the row reads. */
export type PlayerState = 'yet' | 'playing' | 'done' | 'blank';

export interface SquadPlayer {
  /** Position label for the XI, bench order for substitutes. */
  order: string;
  name: string;
  club: string;
  /** C, TC or V. Empty when neither. */
  badge: string;
  isCaptain: boolean;
  /** Minutes, or null before their fixture starts. */
  minutes: number | null;
  state: PlayerState;
  /** Already multiplied, so it is what the manager actually banked. */
  points: number;
  benched: boolean;
}

export interface SquadView {
  event: number;
  live: boolean;
  name: string;
  team: string;
  gross: number;
  cost: number;
  net: number;
  formation: string;
  /** Full chip name, or null. */
  chip: string | null;
  xi: SquadPlayer[];
  bench: SquadPlayer[];
  /** True once the deadline has passed but nothing has kicked off. */
  notStarted: boolean;
}

const CHIP_NAMES: Record<string, string> = {
  WC: 'Wildcard',
  FH: 'Free Hit',
  BB: 'Bench Boost',
  TC: 'Triple Captain',
  AM: 'Assistant Manager',
};

function formationOf(positions: string[]): string {
  const count = (p: string) => positions.filter((x) => x === p).length;
  return `${count('DEF')}-${count('MID')}-${count('FWD')}`;
}

/* --------------------------------------------------------------- fixtures */

function fromFixtures(entryId: number, event: number): SquadView | null {
  const mock = mockLeague();
  const manager = mock.managers.find((m) => m.entryId === entryId);
  if (!manager) return null;

  const score = mock.scores.find((s) => s.entryId === entryId && s.event === event);
  if (!score) return null;

  const squad = mockSquad(entryId, event, score.grossPoints, score.chipUsed, score.transferCost);

  const toRow = (p: (typeof squad.xi)[number], index: number, benched: boolean): SquadPlayer => ({
    order: benched ? String(index + 1) : p.position,
    name: p.name,
    club: p.club,
    badge: p.isCaptain ? (p.multiplier === 3 ? 'TC' : 'C') : p.isVice ? 'V' : '',
    isCaptain: p.isCaptain,
    minutes: p.minutes,
    state: p.minutes === 0 ? 'blank' : 'done',
    points: p.points * Math.max(1, p.multiplier),
    benched: p.multiplier === 0,
  });

  return {
    event,
    live: false,
    name: manager.playerName,
    team: manager.entryName,
    gross: squad.gross,
    cost: squad.transferCost,
    net: squad.net,
    formation: squad.formation,
    chip: squad.chip ? (CHIP_NAMES[squad.chip] ?? squad.chip) : null,
    xi: squad.xi.map((p, i) => toRow(p, i, false)),
    bench: squad.bench.map((p, i) => toRow(p, i, true)),
    notStarted: false,
  };
}

/* --------------------------------------------------------------- real data */

async function fromDatabase(entryId: number, event: number): Promise<SquadView | null> {
  const db = getDb();

  const [[manager], [week], [picks]] = await Promise.all([
    db.select().from(managers).where(eq(managers.entryId, entryId)).limit(1),
    db.select().from(gameweeks).where(eq(gameweeks.event, event)).limit(1),
    db
      .select()
      .from(entryPicks)
      .where(and(eq(entryPicks.entryId, entryId), eq(entryPicks.event, event)))
      .limit(1),
  ]);

  // No picks cached means the deadline has not passed, or nothing has warmed
  // them yet. Either way there is no squad to show rather than an error.
  if (!manager || !week || !picks) return null;

  const [bootstrap, fixtures, live] = await Promise.all([
    fetchBootstrap(),
    fetchFixtures(event),
    fetchLiveEvent(event),
  ]);

  const clubOf = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const player = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const stats = new Map(live.elements.map((e) => [e.id, e.stats]));

  // A player's gameweek is only "not started" until their own club plays.
  const fixtureOf = new Map<number, { started: boolean; finished: boolean }>();
  for (const f of fixtures) {
    for (const team of [f.team_h, f.team_a]) {
      fixtureOf.set(team, { started: f.started, finished: f.finished });
    }
  }

  const anyStarted = fixtures.some((f) => f.started);

  const toRow = (elementId: number, index: number): SquadPlayer => {
    const meta = player.get(elementId);
    const stat = stats.get(elementId);
    const multiplier = picks.multipliers[index] ?? 0;
    const slot = index + 1;
    const benched = multiplier === 0;

    const teamFixture = meta ? fixtureOf.get(meta.team) : undefined;
    const minutes = stat?.minutes ?? 0;
    const state: PlayerState = !teamFixture?.started
      ? 'yet'
      : !teamFixture.finished
        ? 'playing'
        : minutes > 0
          ? 'done'
          : 'blank';

    // Null rather than 0 stops "0'" reading as a player who was on and did
    // nothing, when their match has not kicked off.
    const isCaptain = picks.captainIndex === slot;
    const isVice = picks.viceIndex === slot;

    return {
      order: benched ? String(index - 10) : positionOf(meta?.element_type ?? 0),
      name: meta?.web_name ?? 'Unknown',
      club: meta ? (clubOf.get(meta.team) ?? '') : '',
      badge: isCaptain ? (multiplier === 3 ? 'TC' : 'C') : isVice ? 'V' : '',
      isCaptain,
      minutes: state === 'yet' ? null : minutes,
      state,
      points: (stat?.total_points ?? 0) * Math.max(1, multiplier),
      benched,
    };
  };

  const rows = picks.elementIds.map(toRow);
  const xi = rows.slice(0, 11);
  const bench = rows.slice(11);

  const chip = picks.activeChip ? CHIP_LABELS[picks.activeChip] : null;
  const counted = chip === 'BB' ? rows : xi;
  const gross = counted.reduce((sum, p) => sum + p.points, 0);

  return {
    event,
    live: !week.dataChecked,
    name: manager.playerName,
    team: manager.entryName,
    gross,
    cost: picks.transferCost,
    net: gross - picks.transferCost,
    formation: formationOf(xi.map((p) => p.order)),
    chip: chip ? (CHIP_NAMES[chip] ?? chip) : null,
    xi,
    bench,
    notStarted: !anyStarted,
  };
}

/** Null when there is nothing to show — unknown manager, or picks not yet set. */
export async function getSquad(entryId: number, event: number): Promise<SquadView | null> {
  return getConfig().useFixtures ? fromFixtures(entryId, event) : fromDatabase(entryId, event);
}
