import { describe, expect, it } from 'vitest';
import { groupByMonth, joinedGameweek, monthKeyOf, monthLabel } from './month';

const TZ = 'Europe/London';

describe('monthKeyOf', () => {
  it('maps a deadline to its calendar month', () => {
    expect(monthKeyOf('2026-08-21T17:30:00Z', TZ)).toBe('2026-08');
    expect(monthKeyOf('2026-12-26T12:00:00Z', TZ)).toBe('2026-12');
  });

  it('resolves the month in the configured timezone, not UTC', () => {
    // 31 Aug 20:00 UTC is 21:00 on the 31st in London (BST) but already
    // 06:00 on 1 Sep in Sydney (UTC+10).
    const deadline = '2026-08-31T20:00:00Z';
    expect(monthKeyOf(deadline, 'Europe/London')).toBe('2026-08');
    expect(monthKeyOf(deadline, 'Australia/Sydney')).toBe('2026-09');
  });

  it('respects British Summer Time on a month boundary', () => {
    // 31 Jul 23:30 UTC is 00:30 on 1 Aug in London (BST, UTC+1).
    expect(monthKeyOf('2026-07-31T23:30:00Z', TZ)).toBe('2026-08');
  });

  it('throws on an unparseable deadline rather than defaulting', () => {
    expect(() => monthKeyOf('not-a-date', TZ)).toThrow(/Invalid deadline/);
  });
});

describe('monthLabel', () => {
  it('renders a human label', () => {
    expect(monthLabel('2026-08', TZ)).toBe('August 2026');
    expect(monthLabel('2027-01', TZ)).toBe('January 2027');
  });
});

describe('groupByMonth', () => {
  // The real 2026/27 deadlines, taken from bootstrap-static.
  const events = [
    { event: 1, deadlineTime: '2026-08-21T17:30:00Z' },
    { event: 2, deadlineTime: '2026-08-29T10:00:00Z' },
    { event: 3, deadlineTime: '2026-09-12T10:00:00Z' },
    { event: 4, deadlineTime: '2026-09-19T10:00:00Z' },
    { event: 5, deadlineTime: '2026-09-26T10:00:00Z' },
    { event: 6, deadlineTime: '2026-10-03T10:00:00Z' },
  ];

  it('buckets gameweeks by deadline month', () => {
    const groups = groupByMonth(events, TZ);
    expect([...groups.keys()]).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(groups.get('2026-08')!.map((e) => e.event)).toEqual([1, 2]);
    expect(groups.get('2026-09')!.map((e) => e.event)).toEqual([3, 4, 5]);
  });

  it('produces unequal months — the documented consequence of the rule', () => {
    const groups = groupByMonth(events, TZ);
    expect(groups.get('2026-08')).toHaveLength(2);
    expect(groups.get('2026-09')).toHaveLength(3);
  });

  it('orders gameweeks within a month even if input is unordered', () => {
    const groups = groupByMonth([...events].reverse(), TZ);
    expect(groups.get('2026-09')!.map((e) => e.event)).toEqual([3, 4, 5]);
  });
});

describe('joinedGameweek', () => {
  const events = [
    { event: 1, deadlineTime: '2026-08-21T17:30:00Z' },
    { event: 2, deadlineTime: '2026-08-29T10:00:00Z' },
    { event: 3, deadlineTime: '2026-09-12T10:00:00Z' },
  ];

  it('returns GW1 for someone who joined before the season', () => {
    expect(joinedGameweek(new Date('2026-08-10T16:16:31Z'), events)).toBe(1);
  });

  it('returns the next gameweek for a mid-season joiner', () => {
    expect(joinedGameweek(new Date('2026-08-25T09:00:00Z'), events)).toBe(2);
  });

  it('counts a manager who joins exactly on the deadline', () => {
    expect(joinedGameweek(new Date('2026-08-29T10:00:00Z'), events)).toBe(2);
  });

  it('returns null when they joined after the last deadline', () => {
    expect(joinedGameweek(new Date('2027-06-01T00:00:00Z'), events)).toBeNull();
  });

  it('assumes an ever-present member when no join time was captured', () => {
    expect(joinedGameweek(null, events)).toBe(1);
  });
});

describe('monthShortLabel', () => {
  it('keeps every month to three characters', async () => {
    const { monthShortLabel } = await import('./month');
    const keys = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
    const labels = keys.map((k) => monthShortLabel(k, TZ));
    expect(labels.every((l) => l.length === 3)).toBe(true);
    // en-GB renders September as "Sept" without the trim.
    expect(monthShortLabel('2026-09', TZ)).toBe('Sep');
  });
});
