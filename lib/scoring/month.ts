/**
 * Gameweek → calendar month mapping.
 *
 * Pure functions, no I/O — every rule here is testable with a fixture array
 * and no network.
 *
 * The rule: a gameweek belongs to the month of its DEADLINE, not
 * the month its matches were played in. Deterministic, and easy to explain to
 * the group when December turns out to hold six gameweeks and August two.
 */

/** `YYYY-MM` in the given IANA timezone. */
export function monthKeyOf(deadline: Date | string, timezone: string): string {
  const date = typeof deadline === 'string' ? new Date(deadline) : deadline;

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid deadline: ${String(deadline)}`);
  }

  // en-CA gives ISO-ordered parts, so this is a stable YYYY-MM without
  // hand-rolling timezone arithmetic.
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  })
    .format(date)
    .split('-');

  return `${year}-${month}`;
}

/** "2026-08" → "August 2026", for display. */
export function monthLabel(monthKey: string, timezone: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  // Midday UTC keeps the label on the intended day either side of the line.
  const date = new Date(Date.UTC(year, month - 1, 15, 12));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * "2026-08" → "Aug", for the compact history column.
 *
 * Trimmed to three characters because en-GB renders September as "Sept",
 * which sits a character wider than every other month in the column.
 */
export function monthShortLabel(monthKey: string, timezone: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 15, 12));
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, month: 'short' })
    .format(date)
    .slice(0, 3);
}

export interface DeadlineLike {
  event: number;
  deadlineTime: Date | string;
}

/** Groups gameweeks by month key, preserving gameweek order within each. */
export function groupByMonth<T extends DeadlineLike>(
  events: readonly T[],
  timezone: string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const event of [...events].sort((a, b) => a.event - b.event)) {
    const key = monthKeyOf(event.deadlineTime, timezone);
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  return groups;
}

/**
 * The first gameweek that counts for a manager who joined at `joinedTime`:
 * the earliest gameweek whose deadline is at or after they joined.
 *
 * Joining after the final deadline returns null — they score nothing this
 * season, which is correct rather than an error.
 */
export function joinedGameweek(
  joinedTime: Date | null | undefined,
  events: readonly DeadlineLike[],
): number | null {
  const ordered = [...events].sort((a, b) => a.event - b.event);
  if (ordered.length === 0) return null;

  // No join time (a pre-existing member we never saw unranked) — assume they
  // were there from the start.
  if (!joinedTime) return ordered[0].event;

  const joinedAt = joinedTime.getTime();
  for (const event of ordered) {
    if (new Date(event.deadlineTime).getTime() >= joinedAt) return event.event;
  }

  return null;
}
