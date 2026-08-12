import { getConfig } from '@/lib/config';
import { runPoll } from '@/lib/poll';

/**
 * Cron target. Vercel Cron issues a GET, so that is what this accepts.
 *
 * Never cached — the whole point is to do work.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** A large league means one history request per manager; leave room. */
export const maxDuration = 60;

export async function GET(request: Request) {
  const { cronSecret } = getConfig();

  // Unauthenticated, this route lets anyone burn your FPL rate limit. Vercel
  // Cron sends the secret automatically once CRON_SECRET is set.
  if (cronSecret) {
    const provided = request.headers.get('authorization');
    if (provided !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'unauthorised' }, { status: 401 });
    }
  }

  const result = await runPoll();

  // 'skipped' is the normal, healthy outcome — most runs find nothing to do.
  // Only a genuine failure is a 500, so cron alerting stays meaningful.
  return Response.json(result, { status: result.outcome === 'error' ? 500 : 200 });
}
