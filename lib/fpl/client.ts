/**
 * Typed FPL API client.
 *
 * Every response is validated (see schemas.ts). Politeness is built in rather
 * than optional, because once this is self-hosted many instances share the
 * same upstream: descriptive User-Agent, low concurrency, and
 * hard backoff on 429/403.
 */
import { getConfig } from '../config';
import { z } from 'zod';
import {
  bootstrapSchema,
  entryHistorySchema,
  entryPicksSchema,
  fixturesSchema,
  leagueStandingsSchema,
  liveEventSchema,
  type FplEvent,
} from './schemas';

export class FplApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = 'FplApiError';
  }
}

const RETRYABLE = new Set([429, 403, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET + parse, with exponential backoff.
 *
 * 403 is treated as retryable on purpose: the FPL CDN returns it when it
 * dislikes the caller's IP, which on a serverless host is intermittent
 * rather than permanent.
 */
async function getJson(path: string, revalidate?: number): Promise<unknown> {
  const cfg = getConfig();
  const url = `${cfg.fpl.baseUrl}/${path.replace(/^\/+/, '')}`;

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // Live endpoints share one upstream fetch across concurrent visitors;
      // everything else must be fresh, since the poller decides winners on it.
      const res = await fetch(url, {
        headers: { 'User-Agent': cfg.fpl.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
        ...(revalidate ? { next: { revalidate } } : { cache: 'no-store' as const }),
      });

      if (res.ok) return await res.json();

      if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) {
        throw new FplApiError(`FPL API returned ${res.status} for ${path}`, res.status, path);
      }

      // Honour Retry-After when they send it, otherwise 1s, 2s, 4s.
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** (attempt - 1) * 1000;
      lastError = new FplApiError(`FPL API returned ${res.status}`, res.status, path);
      await sleep(delay);
    } catch (err) {
      if (err instanceof FplApiError && !RETRYABLE.has(err.status ?? 0)) throw err;
      lastError = err;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(2 ** (attempt - 1) * 1000);
    }
  }

  throw new FplApiError(
    `FPL API unreachable after ${MAX_ATTEMPTS} attempts: ${path} (${
      lastError instanceof Error ? lastError.message : String(lastError)
    })`,
    undefined,
    path,
  );
}

/* ---------------------------------------------------------------- public */

/** The 38 gameweeks. Large payload — cache per BOOTSTRAP_CACHE_HOURS. */
export async function fetchEvents(): Promise<FplEvent[]> {
  return (await fetchBootstrap()).events;
}

/** A league member, normalised across the two shapes the API uses. */
export interface LeagueMember {
  entryId: number;
  entryName: string;
  playerName: string;
  /** True once FPL has ranked them; false while they sit in `new_entries`. */
  ranked: boolean;
  /** Only ever present for unranked members — capture it while it exists. */
  joinedTime: Date | null;
}

export interface LeagueRoster {
  leagueName: string;
  startEvent: number;
  members: LeagueMember[];
}

/**
 * The full member list.
 *
 * Reads BOTH `standings.results` and `new_entries.results`. This is not
 * optional defensiveness: before GW1 settles, `standings.results` is empty and
 * every member of the league is in `new_entries`. A poller that reads only the
 * former discovers nobody, which is silent rather than loud.
 *
 * Both arrays paginate independently.
 */
export async function fetchLeagueRoster(leagueId = getConfig().leagueId): Promise<LeagueRoster> {
  const byEntry = new Map<number, LeagueMember>();

  const addRanked = (results: { entry: number; entry_name: string; player_name: string }[]) => {
    for (const r of results) {
      byEntry.set(r.entry, {
        entryId: r.entry,
        entryName: r.entry_name,
        playerName: r.player_name,
        ranked: true,
        joinedTime: null,
      });
    }
  };

  const addUnranked = (
    results: {
      entry: number;
      entry_name: string;
      player_first_name: string;
      player_last_name: string;
      joined_time: string;
    }[],
  ) => {
    for (const r of results) {
      const joinedTime = new Date(r.joined_time);
      const existing = byEntry.get(r.entry);
      if (existing) {
        // Already ranked, but this is our only chance at joined_time.
        existing.joinedTime ??= joinedTime;
      } else {
        byEntry.set(r.entry, {
          entryId: r.entry,
          entryName: r.entry_name,
          playerName: `${r.player_first_name} ${r.player_last_name}`.trim(),
          ranked: false,
          joinedTime,
        });
      }
    }
  };

  // One request covers page 1 of BOTH blocks — they arrive in the same
  // response, so asking twice would just be a wasted round trip upstream.
  const first = leagueStandingsSchema.parse(await getJson(`leagues-classic/${leagueId}/standings/`));
  addRanked(first.standings.results);
  addUnranked(first.new_entries?.results ?? []);

  // Extra requests only when a block actually overflows.
  let hasMoreRanked = first.standings.has_next;
  for (let page = 2; hasMoreRanked; page++) {
    const next = leagueStandingsSchema.parse(
      await getJson(`leagues-classic/${leagueId}/standings/?page_standings=${page}`),
    );
    addRanked(next.standings.results);
    hasMoreRanked = next.standings.has_next;
  }

  let hasMoreUnranked = first.new_entries?.has_next ?? false;
  for (let page = 2; hasMoreUnranked; page++) {
    const next = leagueStandingsSchema.parse(
      await getJson(`leagues-classic/${leagueId}/standings/?page_new_entries=${page}`),
    );
    addUnranked(next.new_entries?.results ?? []);
    hasMoreUnranked = next.new_entries?.has_next ?? false;
  }

  return {
    leagueName: first.league.name,
    startEvent: first.league.start_event,
    members: [...byEntry.values()],
  };
}

/** Per-gameweek history for one manager. The source of truth for scoring. */
export async function fetchEntryHistory(entryId: number) {
  return entryHistorySchema.parse(await getJson(`entry/${entryId}/history/`));
}

/**
 * Runs `task` over `items` with a small concurrency cap, so a 200-manager
 * league does not fire 200 simultaneous requests.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------ live data */

/**
 * bootstrap-static is ~1.4MB and near-static, so it is cached in memory for
 * BOOTSTRAP_CACHE_HOURS. The live table needs `teams` for
 * fixture short codes and `elements` to map players to fixtures.
 */
let bootstrapCache: { at: number; data: z.infer<typeof bootstrapSchema> } | undefined;

export async function fetchBootstrap() {
  const cfg = getConfig();
  const ttl = cfg.fpl.bootstrapCacheHours * 60 * 60 * 1000;

  if (bootstrapCache && Date.now() - bootstrapCache.at < ttl) {
    return bootstrapCache.data;
  }

  const data = bootstrapSchema.parse(await getJson('bootstrap-static/'));
  bootstrapCache = { at: Date.now(), data };
  return data;
}

/** All fixtures for one gameweek. One call drives the whole fixtures grid. */
export async function fetchFixtures(event: number) {
  const { fpl } = getConfig();
  return fixturesSchema.parse(await getJson(`fixtures/?event=${event}`, fpl.liveCacheSeconds));
}

/**
 * Live player stats for one gameweek.
 *
 * One call covers every manager, regardless of league size — which is what
 * makes a live table affordable.
 */
export async function fetchLiveEvent(event: number) {
  const { fpl } = getConfig();
  return liveEventSchema.parse(await getJson(`event/${event}/live/`, fpl.liveCacheSeconds));
}

/**
 * A manager's picks for one gameweek.
 *
 * Frozen at the deadline, so this is fetched once per manager per gameweek and
 * cached in Postgres rather than on every refresh.
 */
export async function fetchEntryPicks(entryId: number, event: number) {
  return entryPicksSchema.parse(await getJson(`entry/${entryId}/event/${event}/picks/`));
}
