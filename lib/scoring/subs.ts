/**
 * The substitutions FPL is going to make, worked out before it makes them.
 *
 * FPL applies automatic substitutions when it finalises a gameweek, which is
 * the same moment it sets `data_checked`. Until then a live table counts the
 * eleven as picked, and anyone whose starter did not appear is scored short —
 * measured over Gameweek 1 to 3, that was 18% to 28% of a league, and it named
 * the wrong weekly winner in a league of eight.
 *
 * This is a reconstruction of FPL's rule, not a reading of its answer, so it
 * can be wrong where the rule has corners this has not met. `applySubs` in
 * `lib/settle.ts` is the other half: it applies the substitutions FPL has
 * actually reported, once the gameweek is settled, and that is what the stored
 * result is always built from. Nothing here is ever written down.
 *
 * Deliberately ignorant of fixtures. "Nobody is substituted until every match
 * is played" is FPL's rule, not this function's business — the caller applies
 * it only once the gameweek is complete, and calling it earlier would sub out
 * players who simply have not kicked off yet.
 */

/** 1 GK, 2 DEF, 3 MID, 4 FWD — FPL's `element_type`. */
const GK = 1;

/**
 * Valid formations are 1 keeper, 3-5 defenders, 2-5 midfielders, 1-3 forwards.
 *
 * Only the lower bounds are tested, because the upper ones cannot be reached:
 * a squad holds exactly 2 keepers, 5 defenders, 5 midfielders and 3 forwards,
 * so there is never a sixth defender to field. The keeper is pinned at one by
 * the rule that a keeper is only ever swapped for the other keeper.
 */
const isValidXI = (counts: readonly number[]) =>
  counts[1] === 1 && counts[2] >= 3 && counts[3] >= 2 && counts[4] >= 1;

export interface Squad {
  /** Element ids in pick order, positions 1–15. */
  elementIds: readonly number[];
  /** Parallel to elementIds: 0 benched, 1 playing, 2 captain, 3 triple captain. */
  multipliers: readonly number[];
  /** Pick position of the captain and vice-captain, 1–15, or null if unknown. */
  captainIndex: number | null;
  viceIndex: number | null;
  activeChip: string | null;
}

/**
 * Returns the multipliers the gameweek will settle on.
 *
 * Parallel to `elementIds`, so the caller scores through them exactly as it
 * scores through the picked ones.
 */
export function predictSubs(
  squad: Squad,
  minutesOf: (elementId: number) => number,
  positionOf: (elementId: number) => number,
): number[] {
  const { elementIds: els, multipliers } = squad;
  const next = [...multipliers];
  const played = (i: number) => minutesOf(els[i]) > 0;

  // Bench Boost plays all fifteen, so there is no bench to substitute from.
  // The armband still moves, which is why this only skips the loop below.
  if (squad.activeChip !== 'bboost') {
    const counts = () =>
      els.reduce<number[]>(
        (a, el, i) => (next[i] > 0 && a[positionOf(el)]++, a),
        [0, 0, 0, 0, 0],
      );

    for (let out = 0; out < 11; out++) {
      if (next[out] === 0 || played(out)) continue;
      const outIsKeeper = positionOf(els[out]) === GK;

      // Bench order is pick order, so the first eligible name wins.
      for (let inn = 11; inn < els.length; inn++) {
        // `next[inn] > 0` means this substitute has already come on for
        // somebody else, which is also what stops one arriving twice.
        if (next[inn] > 0 || !played(inn)) continue;
        // A keeper is only ever replaced by the other keeper, and never
        // replaces an outfielder.
        if (outIsKeeper !== (positionOf(els[inn]) === GK)) continue;

        const restore = next[out];
        next[out] = 0;
        // A substitute always arrives on a plain multiplier. The armband does
        // not travel with the shirt — it passes to the vice-captain below.
        // Carrying it across pays a captain's double to their replacement.
        next[inn] = 1;

        // Counted over all fifteen, so a substitute already brought on is
        // counted too. Reading only the first eleven leaves the tally a player
        // short and blocks a legitimate second substitution.
        if (!isValidXI(counts())) {
          next[out] = restore;
          next[inn] = 0;
          continue;
        }
        break;
      }
    }
  }

  // A captain who does not appear hands the armband to the vice, whether or
  // not anyone came on for them. If the vice is not playing either, nobody
  // captains and the multiplier stays where it is — doubling nothing.
  //
  // The armband is worth two, or three under Triple Captain. Taking it from
  // the captain's own multiplier instead breaks on a squad FPL has already
  // settled, where the blanked captain sits on the bench holding zero: the
  // vice was then handed a zero and lost the points they had doubled.
  const armband = squad.activeChip === '3xc' ? 3 : 2;
  const cap = squad.captainIndex === null ? -1 : squad.captainIndex - 1;
  const vice = squad.viceIndex === null ? -1 : squad.viceIndex - 1;
  if (cap >= 0 && !played(cap) && vice >= 0 && played(vice) && next[vice] > 0) {
    next[vice] = armband;
  }

  return next;
}
