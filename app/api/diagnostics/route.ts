/**
 * What the server can reach, measured from the server.
 *
 * The live table failing on a host while working on a laptop is the hard case
 * to diagnose: the same code, the same API, a different network. Guessing at
 * it from outside costs more than this endpoint does.
 *
 * Reports timings and status codes only. No credentials, no scores.
 */
import { hasAccess } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { gameweeks } from '@/lib/db/schema';
import { getLiveState } from '@/lib/live';
import { asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Raw fetch, no parsing — separates a network problem from a shape problem. */
async function probe(url: string, userAgent: string) {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    const body = await res.text();
    return {
      status: res.status,
      ok: res.ok,
      ms: Date.now() - startedAt,
      kb: Math.round(body.length / 1024),
      // A block usually answers in HTML, so the first bytes identify it.
      head: res.ok ? undefined : body.slice(0, 120),
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  if (!(await hasAccess())) {
    return Response.json({ error: 'unauthorised' }, { status: 401 });
  }

  const cfg = getConfig();
  const db = getDb();

  const dbStartedAt = Date.now();
  const weeks = await db.select().from(gameweeks).orderBy(asc(gameweeks.event));
  const database = { ms: Date.now() - dbStartedAt, gameweeks: weeks.length };

  // The gameweek the page would ask about: the first one not yet settled.
  const event = weeks.find((w) => !w.dataChecked)?.event ?? weeks.at(-1)?.event ?? 1;

  const paths = ['bootstrap-static/', `fixtures/?event=${event}`, `event/${event}/live/`];
  const fpl = Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => [p, await probe(`${cfg.fpl.baseUrl}/${p}`, cfg.fpl.userAgent)]),
    ),
  );

  // The real thing, unbudgeted: how long the page's 2.5s cap is competing with.
  const liveStartedAt = Date.now();
  let live: Record<string, unknown>;
  try {
    const state = await getLiveState(event);
    live = {
      ok: true,
      ms: Date.now() - liveStartedAt,
      started: state?.started ?? null,
      total: state?.total ?? null,
      rows: state?.rows.length ?? null,
    };
  } catch (err) {
    live = {
      ok: false,
      ms: Date.now() - liveStartedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return Response.json(
    {
      event,
      liveScoringEnabled: cfg.live.enabled,
      useFixtures: cfg.useFixtures,
      liveCacheSeconds: cfg.fpl.liveCacheSeconds,
      database,
      fpl,
      live,
      budgetMs: 2500,
      verdict:
        live.ok && typeof live.ms === 'number' && live.ms > 2500
          ? 'reachable but slower than the page budget — the page would drop live scores'
          : live.ok
            ? 'healthy'
            : 'live state failed — see live.error',
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
