import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGE,
  clamp,
  formatFixtures,
  formatGameweek,
  formatHelp,
  formatNext,
  formatSettled,
  formatWinners,
} from './format';
import type { LeaderboardView, TableView, UiRow } from '../view';

function row(over: Partial<UiRow> & Pick<UiRow, 'rank' | 'name'>): UiRow {
  return {
    entryId: 1,
    team: 'Alpha FC',
    chip: null,
    isLeader: false,
    shared: false,
    isNew: false,
    cells: ['70', '+0', '—'],
    ...over,
  };
}

function view(over: Partial<LeaderboardView> = {}): LeaderboardView {
  const table: TableView = {
    title: 'Gameweek 5',
    meta: '3 managers · avg 60',
    headers: ['Points', 'Bonus', 'Hits'],
    note: 'note',
    rows: [
      row({ rank: '01', name: 'Alice', cells: ['90', '+0', '—'] }),
      row({ rank: '02', name: 'Bob', cells: ['70', '+0', '—'] }),
    ],
  };
  return {
    leagueName: 'Mates',
    siteUrl: 'https://example.com',
    weekly: [{ event: 5, label: 'GW5', view: table }],
    monthly: [],
    season: table,
    history: { weekly: [], monthly: [], pending: { gameweek: null, month: null } },
    live: null,
    ...over,
  } as unknown as LeaderboardView;
}

describe('formatting', () => {
  it('renders a gameweek without a code fence', () => {
    // A fence makes Telegram render a full-width COPY CODE bar on mobile,
    // which swamps a short table.
    const out = formatGameweek(view(), 5);
    expect(out).toContain('Alice');
    expect(out).not.toContain('```');
  });

  it('explains itself when a gameweek does not exist', () => {
    expect(formatGameweek(view(), 99)).toMatch(/No gameweek/);
  });

  it('says so when nothing has been won yet', () => {
    expect(formatWinners(view())).toMatch(/Nothing has been won/);
  });

  it('gives the next deadline while a gameweek is being played', () => {
    // The status strip describes the round in progress, so without this the
    // command named /next never mentions a deadline.
    const out = formatNext(
      view({
        preseason: null,
        status: {
          label: 'GW 1 · PROVISIONAL',
          sub: '9 of 10 played · nothing final yet',
          nextDeadline: 'GW 2 deadline Fri 29 Aug, 18:30',
        },
      } as never),
    );
    expect(out).toMatch(/9 of 10 played/);
    expect(out).toMatch(/GW 2 deadline/);
  });

  it('does not repeat the deadline when the strip already says it', () => {
    const out = formatNext(
      view({
        preseason: null,
        status: {
          label: 'GW 1 SETTLED',
          sub: 'GW 2 deadline Fri 29 Aug, 18:30',
          nextDeadline: 'GW 2 deadline Fri 29 Aug, 18:30',
        },
      } as never),
    );
    expect(out.match(/GW 2 deadline/g)).toHaveLength(1);
  });

  it('names the gameweek being waited on rather than saying nothing settled', () => {
    // Matches under way, nothing settled: preseason is null in that state.
    const out = formatWinners(
      view({
        preseason: null,
        history: { weekly: [], monthly: [], pending: { gameweek: 2, month: 'August 2026' } },
      } as never),
    );
    expect(out).toMatch(/Gameweek 2 is not settled yet/);
    expect(out).not.toMatch(/season has not started/);
  });

  it('says which month is outstanding when only weekly winners exist', () => {
    // A month needs every one of its gameweeks settled, so this section is
    // absent for weeks. Without a line it reads as a bug.
    const out = formatWinners(
      view({
        preseason: null,
        history: {
          weekly: [{ gw: 'GW 01', name: 'Alice', pts: 90 }],
          monthly: [],
          pending: { gameweek: 2, month: 'August 2026' },
        },
      } as never),
    );
    expect(out).toMatch(/Alice/);
    expect(out).toMatch(/August 2026 is not settled yet/);
  });

  it('still says the season has not started before it does', () => {
    const out = formatWinners(view({ preseason: { title: 'Season starts soon' } } as never));
    expect(out).toMatch(/season has not started/);
  });

  it('names a single winner', () => {
    expect(formatSettled(view(), 5)).toMatch(/Alice wins Gameweek 5/);
  });

  it('names both when a gameweek is shared', () => {
    const shared = view({
      weekly: [
        {
          event: 5,
          label: 'GW5',
          view: {
            title: 'Gameweek 5',
            meta: '',
            headers: ['Points', 'Hits', 'Bench'],
            note: '',
            rows: [
              row({ rank: '01', name: 'Alice', cells: ['90', '+0', '—'] }),
              row({ rank: '01', name: 'Bob', cells: ['90', '+0', '—'] }),
            ],
          },
        },
      ],
    });
    expect(formatSettled(shared, 5)).toMatch(/Alice and Bob share Gameweek 5/);
  });

  it('escapes MarkdownV2 punctuation that would otherwise break the message', () => {
    // An unescaped "." or "-" makes Telegram reject the whole send.
    // The headline is built from the winner's name, so punctuation there is
    // what would break the send.
    const punctuated = view({
      weekly: [
        {
          event: 5,
          label: 'GW5',
          view: {
            title: 'Gameweek 5',
            meta: '',
            headers: ['Points', 'Hits', 'Bench'],
            note: '',
            rows: [row({ rank: '01', name: 'A.B-C!', cells: ['90', '+0', '—'] })],
          },
        },
      ],
    });
    const backslash = String.fromCharCode(92);
    expect(formatSettled(punctuated, 5)).toContain(
      `A${backslash}.B${backslash}-C${backslash}!`,
    );
  });

  it('truncates a long league rather than exceeding the limit', () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      row({ rank: String(i + 1).padStart(2, '0'), name: `Manager ${i}` }),
    );
    const big = view({ season: { ...view().season, rows: many } });
    const out = formatGameweek(big, 5);
    expect(out.length).toBeLessThan(MAX_MESSAGE);
  });

  it('says so plainly when there are no fixtures', () => {
    expect(formatFixtures(view())).toMatch(/No fixtures/);
  });

  it('lists the commands', () => {
    expect(formatHelp()).toContain('/table');
  });
});

describe('clamp', () => {
  it('leaves a short message alone', () => {
    expect(clamp('short')).toBe('short');
  });

  it('never returns more than Telegram accepts', () => {
    expect(clamp('x'.repeat(MAX_MESSAGE * 2)).length).toBeLessThanOrEqual(MAX_MESSAGE);
  });
});
