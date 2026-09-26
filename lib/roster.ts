/**
 * The league's active members for one season, with the gameweek each joined.
 *
 * `managers` is identity — one row per person, whichever seasons they played —
 * and `manager_seasons` is the season-scoped part: which gameweek counts as
 * their first. Read here, in one place, so the poller, the live table and the
 * page join the two the same way and mask names the same way.
 */
import { and, eq } from 'drizzle-orm';
import { maskManagers } from './anonymise';
import { getDb } from './db';
import { managers, managerSeasons } from './db/schema';
import type { ManagerRef } from './scoring/tables';

export interface RosterMember extends ManagerRef {
  joinedTime: Date | null;
}

/** Inner join on purpose: a member with no row for this season is not in it. */
export async function activeRoster(season: number): Promise<RosterMember[]> {
  const rows = await getDb()
    .select({
      entryId: managers.entryId,
      playerName: managers.playerName,
      entryName: managers.entryName,
      joinedTime: managers.joinedTime,
      joinedGw: managerSeasons.joinedGw,
    })
    .from(managers)
    .innerJoin(
      managerSeasons,
      and(eq(managerSeasons.entryId, managers.entryId), eq(managerSeasons.season, season)),
    )
    .where(eq(managers.active, true));

  return maskManagers(rows);
}
