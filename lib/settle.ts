/**
 * Bonus points per manager, worked out once a gameweek has settled.
 *
 * The history endpoint reports a manager's score but never says how much of it
 * was bonus, and the live feed reports bonus per PLAYER with no idea who owned
 * them. Joining the two needs the manager's picks, so it is done once here and
 * stored, rather than on every page render for every gameweek ever played.
 *
 * Picks are refetched rather than read from `entry_picks`: that cache is a
 * snapshot taken at kickoff, and automatic substitutions do not exist until
 * the gameweek ends.
 *
 * To fill in a gameweek that settled before this existed, clear its
 * `processed_at` and let the poller run. Every write is an upsert and
 * `posted_at` is left alone, so it will not be announced twice.
 */
import { fetchEntryPicks, fetchLiveEvent, mapWithConcurrency } from './fpl/client';
import { getConfig } from './config';

/** What a manager's squad turned into once FPL finished with it. */
export interface SettledEntry {
  entryId: number;
  /** Bonus inside the score, captain multiplier applied. */
  bonus: number;
  /** Recomputed gross points, for checking the reconstruction against FPL. */
  grossPoints: number;
}

/**
 * Applies the substitutions FPL made, so the multipliers describe who actually
 * scored rather than who was picked.
 *
 * Written to be safe if FPL has already applied them to `multiplier` itself:
 * a player subbed out is only zeroed if they are still counted, and one subbed
 * in is only promoted if they are still benched.
 */
export function applySubs(
  picks: { element: number; multiplier: number }[],
  subs: { element_in: number; element_out: number }[],
): Map<number, number> {
  const multiplier = new Map(picks.map((p) => [p.element, p.multiplier]));

  for (const sub of subs) {
    if ((multiplier.get(sub.element_out) ?? 0) > 0) multiplier.set(sub.element_out, 0);
    if ((multiplier.get(sub.element_in) ?? 0) === 0) multiplier.set(sub.element_in, 1);
  }

  return multiplier;
}

/**
 * Bonus and gross points for each manager in a settled gameweek.
 *
 * One request for the gameweek's live data, then one per manager for picks.
 * Paid once by the poller when the gameweek settles, never by a page render.
 */
export async function settleEntries(
  entryIds: number[],
  event: number,
): Promise<SettledEntry[]> {
  if (entryIds.length === 0) return [];

  const cfg = getConfig();
  const live = await fetchLiveEvent(event);

  const bonusOf = new Map(live.elements.map((e) => [e.id, e.stats.bonus]));
  const pointsOf = new Map(live.elements.map((e) => [e.id, e.stats.total_points]));

  return mapWithConcurrency(entryIds, cfg.fpl.concurrency, async (entryId) => {
    const picks = await fetchEntryPicks(entryId, event);
    const multipliers = applySubs(picks.picks, picks.automatic_subs);

    let bonus = 0;
    let grossPoints = 0;

    for (const [elementId, multiplier] of multipliers) {
      if (multiplier === 0) continue;
      bonus += (bonusOf.get(elementId) ?? 0) * multiplier;
      grossPoints += (pointsOf.get(elementId) ?? 0) * multiplier;
    }

    return { entryId, bonus, grossPoints };
  });
}
