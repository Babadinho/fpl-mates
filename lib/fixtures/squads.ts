/**
 * Squads for the mock league.
 *
 * Real player names, so the design meets the cases invented ones miss:
 * diacritics, a space, and a leading initial where two players share a
 * surname. Everything else is generated.
 *
 * The rule that matters: a squad's points must reconcile with the gross total
 * already stored for that manager and gameweek. A panel showing 62 where the
 * table says 66 reads as a scoring bug, not as mock data.
 */

export type MockPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface MockSquadPlayer {
  name: string;
  club: string;
  position: MockPosition;
  /** Before any captain multiplier. */
  points: number;
  minutes: number;
  /** 0 benched, 1 playing, 2 captain, 3 triple captain. */
  multiplier: number;
  isCaptain: boolean;
  isVice: boolean;
}

export interface MockSquad {
  xi: MockSquadPlayer[];
  bench: MockSquadPlayer[];
  formation: string;
  chip: string | null;
  transferCost: number;
  gross: number;
  net: number;
}

const POOL: [string, string, MockPosition][] = [
  ["Raya", "ARS", "GK"],
  ["Pickford", "EVE", "GK"],
  ["A.Becker", "LIV", "GK"],
  ["Donnarumma", "MCI", "GK"],
  ["Arrizabalaga", "ARS", "GK"],
  ["Meslier", "ARS", "GK"],
  ["Gabriel", "ARS", "DEF"],
  ["J.Timber", "ARS", "DEF"],
  ["Virgil", "LIV", "DEF"],
  ["O'Reilly", "MCI", "DEF"],
  ["Saliba", "ARS", "DEF"],
  ["Lacroix", "CHE", "DEF"],
  ["Tarkowski", "EVE", "DEF"],
  ["Guéhi", "MCI", "DEF"],
  ["Matheus N.", "MCI", "DEF"],
  ["Senesi", "TOT", "DEF"],
  ["Calafiori", "ARS", "DEF"],
  ["Hincapie", "ARS", "DEF"],
  ["White", "ARS", "DEF"],
  ["Mosquera", "ARS", "DEF"],
  ["Hill", "BOU", "DEF"],
  ["Truffert", "BOU", "DEF"],
  ["B.Fernandes", "MUN", "MID"],
  ["Saka", "ARS", "MID"],
  ["Palmer", "CHE", "MID"],
  ["Semenyo", "MCI", "MID"],
  ["Mbeumo", "MUN", "MID"],
  ["Cunha", "MUN", "MID"],
  ["Gibbs-White", "NFO", "MID"],
  ["Rice", "ARS", "MID"],
  ["Kroupi.Jr", "BOU", "MID"],
  ["Rogers", "CHE", "MID"],
  ["Wirtz", "LIV", "MID"],
  ["Cherki", "MCI", "MID"],
  ["Doku", "MCI", "MID"],
  ["Bruno G.", "ARS", "MID"],
  ["Enzo", "CHE", "MID"],
  ["Gakpo", "LIV", "MID"],
  ["Szoboszlai", "LIV", "MID"],
  ["Foden", "MCI", "MID"],
  ["Rashford", "MUN", "MID"],
  ["Eze", "ARS", "MID"],
  ["Haaland", "MCI", "FWD"],
  ["Isak", "LIV", "FWD"],
  ["Watkins", "AVL", "FWD"],
  ["Thiago", "BRE", "FWD"],
  ["Gyökeres", "ARS", "FWD"],
  ["Havertz", "ARS", "FWD"],
  ["João Pedro", "CHE", "FWD"],
  ["Ekitiké", "LIV", "FWD"],
  ["Marmoush", "MCI", "FWD"],
  ["Šeško", "MUN", "FWD"],
];

/** Valid outfield shapes, as DEF-MID-FWD. */
const FORMATIONS: [number, number, number][] = [
  [3, 4, 3],
  [4, 4, 2],
  [3, 5, 2],
  [4, 3, 3],
  [5, 3, 2],
  [4, 5, 1],
];

function makeRandom(seed: number) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function drawBy(position: MockPosition, count: number, taken: Set<string>, random: () => number) {
  const available = POOL.filter(([name, , pos]) => pos === position && !taken.has(name));
  const picked: [string, string, MockPosition][] = [];

  for (let i = 0; i < count && available.length > 0; i++) {
    const [entry] = available.splice(Math.floor(random() * available.length), 1);
    taken.add(entry[0]);
    picked.push(entry);
  }

  return picked;
}

/**
 * A squad whose points add up to `gross`.
 *
 * Raw scores are drawn first, then scaled to the stored total and the rounding
 * drift pushed onto one player, so the panel and the table can never disagree.
 */
export function mockSquad(
  entryId: number,
  event: number,
  gross: number,
  chip: string | null,
  transferCost: number,
): MockSquad {
  const random = makeRandom(entryId * 97 + event * 7919);
  const [defs, mids, fwds] = FORMATIONS[Math.floor(random() * FORMATIONS.length)];

  const taken = new Set<string>();
  const starters = [
    ...drawBy('GK', 1, taken, random),
    ...drawBy('DEF', defs, taken, random),
    ...drawBy('MID', mids, taken, random),
    ...drawBy('FWD', fwds, taken, random),
  ];
  const subs = [
    ...drawBy('GK', 1, taken, random),
    ...drawBy('DEF', 5 - defs > 0 ? 1 : 1, taken, random),
    ...drawBy('MID', 1, taken, random),
    ...drawBy('FWD', 1, taken, random),
  ];

  // Captain and vice are always outfield starters, as they almost always are.
  const outfield = starters.map((_, i) => i).filter((i) => i > 0);
  const captainAt = outfield[Math.floor(random() * outfield.length)];
  let viceAt = outfield[Math.floor(random() * outfield.length)];
  if (viceAt === captainAt) viceAt = outfield[(outfield.indexOf(captainAt) + 1) % outfield.length];

  const benchBoost = chip === 'BB';
  const tripleCaptain = chip === 'TC';

  const build = (
    entry: [string, string, MockPosition],
    index: number,
    onBench: boolean,
  ): MockSquadPlayer => {
    const played = random() > 0.12;
    return {
      name: entry[0],
      club: entry[1],
      position: entry[2],
      points: 0,
      minutes: played ? (random() > 0.25 ? 90 : Math.floor(20 + random() * 65)) : 0,
      multiplier: onBench && !benchBoost ? 0 : index === captainAt ? (tripleCaptain ? 3 : 2) : 1,
      isCaptain: !onBench && index === captainAt,
      isVice: !onBench && index === viceAt,
    };
  };

  const xi = starters.map((entry, i) => build(entry, i, false));
  const bench = subs.map((entry, i) => build(entry, 11 + i, true));

  // Raw scores: a goalkeeper rarely hauls, a forward sometimes does.
  const ceiling: Record<MockPosition, number> = { GK: 7, DEF: 9, MID: 13, FWD: 15 };
  const all = [...xi, ...bench];
  for (const player of all) {
    player.points = player.minutes === 0 ? 0 : Math.round(random() * ceiling[player.position]);
  }

  const scoring = benchBoost ? all : xi;
  const weighted = () => scoring.reduce((sum, p) => sum + p.points * Math.max(1, p.multiplier), 0);

  const raw = weighted();
  if (raw > 0) {
    const factor = gross / raw;
    for (const player of scoring) player.points = Math.max(0, Math.round(player.points * factor));
  }

  // Rounding leaves a few points either way. Put them on someone who played,
  // never the captain, whose doubling would overshoot again.
  let drift = gross - weighted();
  const adjustable = scoring.filter((p) => p.minutes > 0 && !p.isCaptain);
  for (let i = 0; drift !== 0 && adjustable.length > 0 && i < 500; i++) {
    const player = adjustable[i % adjustable.length];
    const step = drift > 0 ? 1 : -1;
    if (player.points + step < 0) continue;
    player.points += step;
    drift -= step;
  }

  return {
    xi,
    bench,
    formation: `${defs}-${mids}-${fwds}`,
    chip,
    transferCost,
    gross,
    net: gross - transferCost,
  };
}
