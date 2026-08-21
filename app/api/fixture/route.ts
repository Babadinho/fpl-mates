import { hasAccess } from '@/lib/auth';
import { getFixtureDetail } from '@/lib/fixture';

/** One fixture's events, fetched when the panel opens. Gated like the page. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!(await hasAccess())) {
    return Response.json({ error: 'unauthorised' }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const event = Number(params.get('event'));
  const id = Number(params.get('id'));

  if (!Number.isInteger(event) || event < 1 || event > 38 || !Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'event and id are required' }, { status: 400 });
  }

  try {
    const detail = await getFixtureDetail(event, id);
    if (!detail) return Response.json({ error: 'no such fixture' }, { status: 404 });
    return Response.json(detail);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'could not load the fixture' },
      { status: 502 },
    );
  }
}
