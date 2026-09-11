import { describe, expect, it } from 'vitest';
import { predictSubs, type Squad } from './subs';

/**
 * A squad in pick order: eleven then four on the bench, in a 4-4-2 with the
 * keeper first. Positions are FPL's element_type, and element ids are chosen
 * so the id doubles as the position for readability in the tests below.
 */
const GK = 1, DEF = 2, MID = 3, FWD = 4;
const SHAPE = [GK, DEF, DEF, DEF, DEF, MID, MID, MID, MID, FWD, FWD, GK, DEF, MID, FWD];

const squad = (over: Partial<Squad> = {}): Squad => ({
  elementIds: SHAPE.map((_, i) => i + 1),
  multipliers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  captainIndex: null,
  viceIndex: null,
  activeChip: null,
  ...over,
});

const positionOf = (id: number) => SHAPE[id - 1];
/** Everyone played 90 minutes except the ids named. */
const blanked = (...ids: number[]) => (id: number) => (ids.includes(id) ? 0 : 90);

describe('predictSubs', () => {
  it('leaves a squad alone when everybody played', () => {
    expect(predictSubs(squad(), blanked(), positionOf)).toEqual(squad().multipliers);
  });

  it('brings on the first bench player who played', () => {
    // Pick 10 is a forward who did not appear; pick 12 is the reserve keeper
    // and 13 the first outfielder on the bench.
    const out = predictSubs(squad(), blanked(10), positionOf);
    expect(out[9]).toBe(0);
    expect(out[12]).toBe(1);
  });

  it('skips a bench player who did not play either', () => {
    // 13 is next off the bench but blanked too, so 14 comes on instead.
    const out = predictSubs(squad(), blanked(10, 13), positionOf);
    expect(out[12]).toBe(0);
    expect(out[13]).toBe(1);
  });

  it('replaces a keeper only with the other keeper', () => {
    const out = predictSubs(squad(), blanked(1), positionOf);
    expect(out[0]).toBe(0);
    expect(out[11]).toBe(1);
    // The outfielders on the bench are left where they are.
    expect(out.slice(12)).toEqual([0, 0, 0]);
  });

  it('does not send an outfielder on for a keeper', () => {
    // Reserve keeper blanked as well, so there is nobody to bring on: FPL
    // leaves the keeper in place rather than playing ten men.
    const out = predictSubs(squad(), blanked(1, 12), positionOf);
    expect(out[0]).toBe(1);
    expect(out.slice(11)).toEqual([0, 0, 0, 0]);
  });

  /**
   * The formation is the limit, not the bench. Three defenders is the minimum,
   * so the fourth to blank cannot be replaced by the midfielder or forward
   * waiting on the bench.
   */
  it('refuses a substitution that would break the formation', () => {
    const out = predictSubs(squad(), blanked(2, 3), positionOf);
    // Pick 13 is the only defender on the bench, so one of them is covered.
    expect(out[12]).toBe(1);
    // The other stays: coming down to three defenders is as far as it goes.
    expect(out.filter((m) => m > 0)).toHaveLength(11);
  });

  /**
   * Regression: the formation was tallied over the first eleven picks only, so
   * a substitute already brought on was not counted, the defender tally read
   * one short, and the second substitution was wrongly refused.
   */
  it('counts a substitute already on when judging the next one', () => {
    const out = predictSubs(squad(), blanked(4, 10), positionOf);

    expect(out[3]).toBe(0); // the defender who blanked
    expect(out[9]).toBe(0); // the forward who blanked
    expect(out[12]).toBe(1); // defender on for the defender
    // Bench order decides, not position: the midfielder is next off the bench
    // and 4-5-1 is legal, so he comes on rather than the forward behind him.
    expect(out[13]).toBe(1);
    expect(out[14]).toBe(0);
    expect(out.filter((m) => m > 0)).toHaveLength(11);
  });

  /**
   * Regression: the substitute inherited the outgoing player's multiplier, so
   * a captain who blanked handed their double to whoever replaced them. FPL
   * brings a substitute on plainly and moves the armband to the vice.
   */
  it('brings a captain’s replacement on without the armband', () => {
    const out = predictSubs(
      squad({ multipliers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], captainIndex: 10, viceIndex: 11 }),
      blanked(10),
      positionOf,
    );
    expect(out[12]).toBe(1); // the replacement, on a plain multiplier
    expect(out[10]).toBe(2); // the vice-captain, now wearing it
  });

  it('moves the armband even when nobody could come on', () => {
    // The whole bench blanked, so the captain stays on the pitch scoring
    // nothing — but the vice still takes over.
    const out = predictSubs(
      squad({ multipliers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], captainIndex: 10, viceIndex: 11 }),
      blanked(10, 12, 13, 14, 15),
      positionOf,
    );
    expect(out[10]).toBe(2);
  });

  it('leaves the armband alone when the vice did not play either', () => {
    const out = predictSubs(
      squad({ multipliers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], captainIndex: 10, viceIndex: 11 }),
      blanked(10, 11),
      positionOf,
    );
    expect(out[10]).toBe(0);
    expect(out.filter((m) => m === 2)).toHaveLength(0);
  });

  it('passes a triple captain’s multiplier to the vice', () => {
    const out = predictSubs(
      squad({
        multipliers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 1],
        captainIndex: 10,
        viceIndex: 11,
        activeChip: '3xc',
      }),
      blanked(10),
      positionOf,
    );
    expect(out[10]).toBe(3);
  });

  it('makes no substitution under Bench Boost, where all fifteen play', () => {
    const all = new Array(15).fill(1);
    const out = predictSubs(
      squad({ multipliers: all, activeChip: 'bboost' }),
      blanked(10),
      positionOf,
    );
    expect(out).toEqual(all);
  });

  /**
   * Regression: a squad FPL has already settled. The blanked captain is on the
   * bench holding a zero and the vice already wears the armband, so reading the
   * armband's value off the captain handed the vice that zero — costing a real
   * manager their doubled keeper, twelve points, in Gameweek 1.
   */
  it('leaves a squad alone that FPL has already substituted', () => {
    const settled: Squad = {
      elementIds: SHAPE.map((_, i) => i + 1),
      // Pick 14 was captain, blanked, and is benched; pick 1 is the vice and
      // already carries the double.
      multipliers: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      captainIndex: 14,
      viceIndex: 1,
      activeChip: null,
    };

    expect(predictSubs(settled, blanked(12, 13, 14, 15), positionOf)).toEqual(settled.multipliers);
  });

  /**
   * Gameweek 3 in the real league, which is where this came from: Watkins did
   * not appear and Branthwaite came on for three points, taking the manager
   * from 58 to 61 and past the 59 that had been leading. The live table showed
   * the wrong winner for a day.
   */
  it('reproduces the substitution that changed a weekly winner', () => {
    const WATKINS = 10;
    const BRANTHWAITE = 13;
    const out = predictSubs(squad(), blanked(WATKINS), positionOf);

    const points = new Map([[WATKINS, 0], [BRANTHWAITE, 3]]);
    const scored = (m: number[]) =>
      58 + m.reduce((a, mult, i) => a + (points.get(i + 1) ?? 0) * mult, 0);

    expect(scored([...squad().multipliers])).toBe(58);
    expect(scored(out)).toBe(61);
  });
});
