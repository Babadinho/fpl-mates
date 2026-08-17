import { hasAccess } from '@/lib/auth';
import { getSquad } from '@/lib/squad';

/**
 * One manager's squad, fetched when the panel opens.
 *
 * Behind the same gate as the page. Without that check a passcoded league
 * would still hand out its squads to anyone who guessed the entry id.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** A cold cache means one request per manager; a warm one means none. */
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!(await hasAccess())) {
    return Response.json({ error: 'unauthorised' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const entryId = Number(params.get('entry'));
  const event = Number(params.get('event'));

  if (!Number.isInteger(entryId) || entryId <= 0 || !Number.isInteger(event) || event < 1 || event > 38) {
    return Response.json({ error: 'entry and event are required' }, { status: 400 });
  }

  try {
    const squad = await getSquad(entryId, event);
    if (!squad) {
      return Response.json({ error: 'no squad for that gameweek yet' }, { status: 404 });
    }
    return Response.json(squad);
  } catch (error) {
    // The squad is a nicety; the tables behind it must keep working.
    return Response.json(
      { error: error instanceof Error ? error.message : 'could not load the squad' },
      { status: 502 },
    );
  }
}
