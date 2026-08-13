/**
 * Passcode gate.
 *
 * One shared passcode for the whole league — not accounts. The brief puts user
 * accounts out of scope, and a group of friends does not want to manage
 * logins; they want the table to be private and the link to be shareable.
 *
 * The cookie stores a hash, never the passcode. Verification is a fresh
 * comparison against the configured value, so changing LEAGUE_PASSCODE (or
 * CRON_SECRET) invalidates every existing session.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getConfig } from './config';

export const ACCESS_COOKIE = 'fpl-access';

/**
 * Cookie lifetime in seconds, from PASSCODE_REMEMBER_DAYS.
 *
 * The gate's footnote is generated from the same value — the number used to be
 * written twice, once as behaviour and once as prose, which meant changing one
 * made the page lie.
 */
export function accessMaxAge(): number {
  return getConfig().site.passcodeRememberDays * 24 * 60 * 60;
}

/** "90 days", "1 day", "6 weeks" — phrasing for the gate's footnote. */
export function rememberedFor(): string {
  const days = getConfig().site.passcodeRememberDays;
  if (days === 1) return '1 day';
  if (days % 7 === 0 && days < 60) {
    const weeks = days / 7;
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  return `${days} days`;
}

/**
 * Proof of knowing the passcode, safe to store in a cookie.
 *
 * Salted with CRON_SECRET when there is one, so rotating that secret also
 * logs everybody out.
 */
function accessToken(passcode: string): string {
  const { cronSecret } = getConfig();
  return createHash('sha256').update(`${passcode}:${cronSecret ?? 'fpl-mates'}`).digest('hex');
}

/** Constant-time comparison, so a wrong passcode leaks nothing through timing. */
export function passcodeMatches(candidate: string): boolean {
  const { passcode } = getConfig().site;
  if (!passcode) return true;

  // Hash both sides first: timingSafeEqual throws on length mismatch, which
  // would otherwise reveal the length of the real passcode.
  const a = createHash('sha256').update(candidate.trim()).digest();
  const b = createHash('sha256').update(passcode).digest();
  return timingSafeEqual(a, b);
}

export function tokenFor(passcode: string): string {
  return accessToken(passcode);
}

/** True when the visitor may see the league — either no gate, or a valid cookie. */
export async function hasAccess(): Promise<boolean> {
  const { passcode } = getConfig().site;
  if (!passcode) return true;

  const cookie = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!cookie) return false;

  const expected = accessToken(passcode);
  if (cookie.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}
