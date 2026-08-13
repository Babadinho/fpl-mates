/**
 * Single source of truth for every configurable value.
 *
 * Rules this file enforces:
 *   1. `process.env` is read HERE AND NOWHERE ELSE in the codebase.
 *   2. The app boots with only FPL_LEAGUE_ID and DATABASE_URL set.
 *   3. A missing optional variable degrades a feature; it never crashes the poller.
 *
 * Server-side only — never import this from a client component. Theme values
 * reach the browser as CSS variables rendered into the server HTML.
 */
import { z } from 'zod';

/* ---------------------------------------------------------------- helpers */

/**
 * Accepts true/1/yes/on (and the inverse), case-insensitive.
 *
 * Reports failure through `ctx.addIssue` rather than throwing: an exception
 * raised inside a transform escapes safeParse entirely, so the self-hoster
 * would get a raw stack trace that never names the offending variable.
 */
const boolEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v.trim() === '') return fallback;
      const s = v.trim().toLowerCase();
      if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
      if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
      ctx.addIssue({ code: 'custom', message: `must be true or false, got "${v}"` });
      return z.NEVER;
    });

/**
 * CSS colours are interpolated into style attributes, so restrict the charset.
 * A self-hoster can only attack themselves here, but there is no reason to
 * allow `;` or `<` to escape the declaration.
 */
const cssColor = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? fallback : v.trim()))
    .refine((v) => /^[a-zA-Z0-9#%.,()/\s-]+$/.test(v), {
      message: 'contains characters not valid in a CSS colour',
    });

/** Software name and version. Forks that rename should change this. */
const APP_NAME = 'fpl-mates';
const APP_VERSION = '0.1.0';

/**
 * Identifies the software AND the deployment running it, so a fork's traffic
 * points at the fork rather than at this repository. Falls back to the
 * upstream URL when the site has no public address yet.
 */
function defaultUserAgent(siteUrl: string): string {
  const local = siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1');
  const contact = local ? `https://github.com/Babadinho/${APP_NAME}` : siteUrl;
  return `${APP_NAME}/${APP_VERSION} (+${contact})`;
}

const TIEBREAK_KEYS = ['points', 'hits', 'bench', 'overall_rank'] as const;
export type TiebreakKey = (typeof TIEBREAK_KEYS)[number];

/** Plain-English rule names for the footnote under every table. */
export const TIEBREAK_LABELS: Record<TiebreakKey, string> = {
  points: 'the higher score',
  hits: 'fewer points lost to transfers',
  bench: 'fewer points left on the bench',
  overall_rank: 'the better overall FPL rank',
};

/** Comma-separated tie-break rule keys, applied in order. */
const tiebreakOrder = z
  .string()
  .optional()
  .transform((v) =>
    (v === undefined || v.trim() === '' ? 'points,hits,bench,overall_rank' : v)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
  .refine((keys) => keys.length > 0 && keys.every((k) => TIEBREAK_KEYS.includes(k as TiebreakKey)), {
    message: `must be a comma-separated subset of: ${TIEBREAK_KEYS.join(', ')}`,
  })
  .refine((keys) => keys[0] === 'points', {
    message: 'must start with "points" — total points always decides first',
  })
  .transform((keys) => keys as TiebreakKey[]);

const timezone = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? 'Europe/London' : v.trim()))
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'not a recognised IANA timezone (e.g. Europe/London)' },
  );

/* ----------------------------------------------------------------- schema */

const schema = z.object({
  // ---- Required ----------------------------------------------------------
  // An unset variable and an empty one are the same mistake, so normalise ''
  // to undefined — otherwise z.coerce turns '' into 0 and reports "too small".
  FPL_LEAGUE_ID: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce
      .number({ message: 'must be the number from your mini-league URL, e.g. 123456' })
      .int('must be a whole number')
      .positive('must be greater than zero'),
  ),
  DATABASE_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.url({ message: 'is required — a Postgres connection string' }),
  ),

  // ---- Database ----------------------------------------------------------
  /** Direct (non-pooled) connection. Migrations only. Falls back to DATABASE_URL. */
  DATABASE_URL_UNPOOLED: z.url().optional(),

  // ---- Identity and copy -------------------------------------------------
  /** Overrides the league name from the API. Undefined = use whatever FPL returns. */
  LEAGUE_DISPLAY_NAME: z.string().min(1).optional(),
  /** e.g. "2026/27". Undefined = derived from the bootstrap gameweek deadlines. */
  SEASON_LABEL: z.string().min(1).optional(),
  /**
   * Canonical origin, used to make share-preview image URLs absolute.
   * Falls back to the domain Vercel injects, then to localhost, so a fork
   * never advertises somebody else's site.
   */
  SITE_URL: z
    .string()
    .optional()
    .transform((v) => {
      const explicit = v?.trim();
      if (explicit) return explicit.replace(/\/+$/, '');
      const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
      return vercel ? `https://${vercel}` : 'http://localhost:3000';
    }),

  /** Small uppercase line above the league name in the header. */
  SITE_EYEBROW: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : 'Fantasy Premier League')),

  // ---- Scoring rules -----------------------------------------------------
  TIMEZONE: timezone,
  TIEBREAK_ORDER: tiebreakOrder,
  /** Do gameweeks before a manager joined the league count? */
  COUNT_PREJOIN_GWS: boolEnv(false),

  // ---- Theme (mapped onto the CSS variables) ------------------------------
  ACCENT_COLOR: cssColor('oklch(0.42 0.17 305)'),
  POP_COLOR: cssColor('oklch(0.72 0.19 145)'),
  ACCENT_COLOR_DARK: cssColor('oklch(0.72 0.19 145)'),
  POP_COLOR_DARK: cssColor('oklch(0.78 0.16 100)'),
  /**
   * Shared passcode for the whole league. Unset means the page is public.
   * Not accounts — the brief puts those out of scope, and a group of friends
   * wants a private table, not a login to administer.
   */
  LEAGUE_PASSCODE: z.string().min(4, 'must be at least 4 characters').optional(),
  /**
   * How long a device stays unlocked after entering the passcode. The gate's
   * own footnote is generated from this, so the promise cannot drift from the
   * behaviour.
   */
  PASSCODE_REMEMBER_DAYS: z.coerce.number().int().min(1).max(400).default(90),

  /**
   * Let search engines index the site. Off by default: a mini-league table is
   * a private thing among friends, not something to be found by strangers.
   */
  ALLOW_INDEXING: boolEnv(false),
  /** Show the bench-points column in tables (the prototype's `showBench` prop). */
  SHOW_BENCH_COLUMN: boolEnv(true),
  /**
   * Search box above the table. `auto` shows it only once the league is larger
   * than one page — a five-manager league has nothing to search for.
   */
  SHOW_SEARCH: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const s = (v ?? 'auto').trim().toLowerCase();
      if (s === '' || s === 'auto') return 'auto' as const;
      if (['1', 'true', 'yes', 'y', 'on', 'always'].includes(s)) return 'always' as const;
      if (['0', 'false', 'no', 'n', 'off', 'never'].includes(s)) return 'never' as const;
      ctx.addIssue({ code: 'custom', message: `must be auto, true or false, got "${v}"` });
      return z.NEVER;
    }),

  // ---- Poller ------------------------------------------------------------
  FPL_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim().replace(/\/+$/, '') : 'https://fantasy.premierleague.com/api')),
  /** FPL throttles anonymous clients, so identify this deployment. */
  FPL_USER_AGENT: z.string().min(1).optional(),
  /** Parallel entry-history requests. Kept low to stay a polite client. */
  POLL_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(4),
  /**
   * Seconds to share one live/fixtures fetch across visitors. Without it, ten
   * people opening the page at once costs twenty upstream requests for
   * identical data.
   */
  LIVE_CACHE_SECONDS: z.coerce.number().int().min(0).max(300).default(30),
  /** bootstrap-static is large and near-static; cache it hard. */
  BOOTSTRAP_CACHE_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  /** If set, /api/poll requires `Authorization: Bearer <secret>`. */
  CRON_SECRET: z.string().min(1).optional(),

  /**
   * Render the checked-in mock league instead of reading Postgres. Lets the
   * app be run and reviewed without a database or a live season.
   */
  USE_FIXTURES: boolEnv(false),

  /**
   * Provisional scores and the fixtures grid while a gameweek is in play.
   * Costs two API requests per page load; turn off to poll only.
   */
  LIVE_SCORING: boolEnv(true),
  /**
   * Re-fetch live scores on a timer. Off by default — the refresh button is
   * the intended way, and a timer means every open tab polls whether anyone
   * is watching or not.
   */
  LIVE_AUTO_REFRESH: boolEnv(false),
  /** Interval for LIVE_AUTO_REFRESH, in seconds. Ignored when it is off. */
  LIVE_REFRESH_SECONDS: z.coerce.number().int().min(15).max(600).default(60),

  // ---- WhatsApp (absent = publisher disabled, web only) ------------------
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_RECIPIENT: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
});

/* ----------------------------------------------------------------- export */

function load() {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(
      `Invalid environment configuration:\n${lines.join('\n')}\n\n` +
        `See .env.example for every supported variable. Only FPL_LEAGUE_ID and ` +
        `DATABASE_URL are required.`,
    );
  }

  const env = parsed.data;

  return Object.freeze({
    leagueId: env.FPL_LEAGUE_ID,

    db: {
      url: env.DATABASE_URL,
      migrationUrl: env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL,
    },

    site: {
      leagueName: env.LEAGUE_DISPLAY_NAME, // undefined = fall back to the API's league.name
      seasonLabel: env.SEASON_LABEL, // undefined = derive from deadlines
      eyebrow: env.SITE_EYEBROW,
      url: env.SITE_URL,
      allowIndexing: env.ALLOW_INDEXING,
      passcode: env.LEAGUE_PASSCODE,
      passcodeRememberDays: env.PASSCODE_REMEMBER_DAYS,
      showBenchColumn: env.SHOW_BENCH_COLUMN,
      searchMode: env.SHOW_SEARCH,
    },

    theme: {
      light: { accent: env.ACCENT_COLOR, pop: env.POP_COLOR },
      dark: { accent: env.ACCENT_COLOR_DARK, pop: env.POP_COLOR_DARK },
    },

    rules: {
      timezone: env.TIMEZONE,
      tiebreakOrder: env.TIEBREAK_ORDER,
      countPrejoinGws: env.COUNT_PREJOIN_GWS,
    },

    fpl: {
      baseUrl: env.FPL_BASE_URL,
      userAgent: env.FPL_USER_AGENT ?? defaultUserAgent(env.SITE_URL),
      concurrency: env.POLL_CONCURRENCY,
      bootstrapCacheHours: env.BOOTSTRAP_CACHE_HOURS,
      liveCacheSeconds: env.LIVE_CACHE_SECONDS,
    },

    cronSecret: env.CRON_SECRET,

    live: {
      enabled: env.LIVE_SCORING,
      autoRefresh: env.LIVE_AUTO_REFRESH,
      refreshSeconds: env.LIVE_REFRESH_SECONDS,
    },

    /** Render the checked-in mock league instead of reading Postgres. */
    useFixtures: env.USE_FIXTURES,

    /** Null when any required credential is absent — the web app runs regardless. */
    whatsapp:
      env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_RECIPIENT
        ? {
            phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
            accessToken: env.WHATSAPP_ACCESS_TOKEN,
            recipient: env.WHATSAPP_RECIPIENT,
            verifyToken: env.WHATSAPP_VERIFY_TOKEN,
          }
        : null,
  });
}

export type Config = ReturnType<typeof load>;

let cached: Config | undefined;

/** Parsed once per process, then reused. */
export function getConfig(): Config {
  return (cached ??= load());
}
