'use client';

import { useState } from 'react';
import { Fixtures } from './fixtures';
import { Preseason } from './preseason';
import { PAGE_SIZE, type LeaderboardView, type TableView, type UiRow } from '@/lib/view';

type Tab = 'weekly' | 'monthly' | 'season' | 'history' | 'fixtures';

const BASE_TABS: { key: Tab; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'season', label: 'Season' },
  { key: 'history', label: 'History' },
];

/** Grid is shared by the header row and every body row so columns line up. */
const GRID = 'grid grid-cols-[44px_minmax(0,1fr)_72px_88px] sm:grid-cols-[44px_minmax(0,1fr)_96px_96px_104px]';

function PagerButton({
  label,
  enabled,
  onClick,
}: {
  label: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={`rounded-[4px] border border-line bg-panel px-3.5 py-2 font-mono text-[11px] tracking-[0.06em] uppercase transition-colors ${
        enabled ? 'cursor-pointer text-ink hover:border-accent hover:text-accent' : 'cursor-default text-dim opacity-45'
      }`}
    >
      {label}
    </button>
  );
}

function Pill({
  label,
  active,
  live = false,
  onClick,
}: {
  label: string;
  active: boolean;
  live?: boolean;
  onClick: () => void;
}) {
  // The in-play gameweek is amber rather than accent, so a provisional table is
  // never mistaken for a settled one.
  const selected = live ? 'border-amber bg-amber text-bg' : 'border-accent bg-accent text-accent-ink';
  const idle = live
    ? 'border-amber/50 bg-panel text-amber hover:border-amber'
    : 'border-line bg-panel text-dim hover:border-accent hover:text-accent';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-[4px] border px-[11px] py-[7px] font-mono text-[11px] tracking-[0.04em] transition-colors ${
        active ? selected : idle
      }`}
    >
      {label}
    </button>
  );
}

function Row({ row }: { row: UiRow }) {
  return (
    <div
      className={`${GRID} items-center border-b border-hair px-3.5 py-[15px] transition-colors duration-[120ms] hover:bg-hover`}
    >
      <div className="font-mono text-[13px] text-dim">{row.rank}</div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-medium tracking-[-0.01em]">{row.name}</span>
            {row.isLeader && <span className="h-1.5 w-1.5 flex-none rounded-full bg-pop" />}
          </div>
          <span className="truncate font-mono text-[11px] text-dim">{row.team}</span>
        </div>
        {row.chip && (
          <span className="flex-none rounded-[3px] border border-line px-1.5 py-[3px] font-mono text-[10px] tracking-[0.08em] text-accent uppercase">
            {row.chip}
          </span>
        )}
      </div>

      <div className="text-right font-mono text-[16px]">{row.c0}</div>
      <div className="text-right font-mono text-[13px] text-dim">{row.c1}</div>
      {/* Below 640px the table drops to two numeric columns (section 10). */}
      <div className="hidden text-right font-mono text-[13px] text-dim sm:block">{row.c2}</div>
    </div>
  );
}

function Table({ view, showSearch }: { view: TableView; showSearch: boolean }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const rows = q
    ? view.rows.filter((r) => `${r.name} ${r.team}`.toLowerCase().includes(q))
    : view.rows;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Clamped rather than trusted: filtering can shrink the list under a stale page.
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  const paged = rows.length > PAGE_SIZE;

  return (
    <section className="pt-[26px]">
      {/*
        Section 10 puts the title and meta on a common baseline, which holds
        from 640px up. On a phone they stack instead, so the display type keeps
        its full 32px rather than shrinking to share the row.
      */}
      <div className="flex flex-col items-start gap-2.5 pb-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
        <h2 className="display m-0 text-[32px] tracking-[0.02em]">{view.title}</h2>
        <div className="font-mono text-[11px] whitespace-nowrap text-dim">{view.meta}</div>
      </div>

      {showSearch && (
        <div className="flex items-center gap-4 pb-4">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search manager or team"
            aria-label="Search manager or team"
            className="w-full max-w-[300px] rounded-[4px] border border-line bg-panel px-3 py-2.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
          />
        </div>
      )}

      <div className={`${GRID} border-b border-line px-3.5 pb-2.5`}>
        <div className="label">#</div>
        <div className="label">Manager</div>
        <div className="label text-right">{view.headers[0]}</div>
        <div className="label text-right">{view.headers[1]}</div>
        <div className="label hidden text-right sm:block">{view.headers[2]}</div>
      </div>

      {rows.length === 0 ? (
        <p className="border-b border-hair px-3.5 py-8 font-mono text-[12px] text-dim">
          {q ? `No manager matches "${query.trim()}".` : 'No scores recorded for this period.'}
        </p>
      ) : (
        visible.map((row) => <Row key={row.entryId} row={row} />)
      )}

      {paged && (
        <div className="flex flex-col items-start gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span className="font-mono text-[11px] text-dim">
            {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
            {q ? ' matching' : ''}
          </span>
          <div className="flex items-center gap-2.5">
            <PagerButton label="Prev" enabled={current > 0} onClick={() => setPage(current - 1)} />
            <span className="min-w-[88px] text-center font-mono text-[11px] text-dim">
              Page {current + 1} / {pageCount}
            </span>
            <PagerButton
              label="Next"
              enabled={current < pageCount - 1}
              onClick={() => setPage(current + 1)}
            />
          </div>
        </div>
      )}

      <p className="px-3.5 pt-[18px] font-mono text-[11px] leading-[1.7] text-dim">{view.note}</p>
    </section>
  );
}

function History({ history }: { history: LeaderboardView['history'] }) {
  return (
    <section className="grid grid-cols-1 gap-14 pt-[34px] md:grid-cols-2">
      <div>
        <h2 className="display m-0 mb-4 text-[32px] tracking-[0.02em]">Weekly winners</h2>
        {history.weekly.length === 0 && (
          <p className="font-mono text-[12px] text-dim">No gameweeks settled yet.</p>
        )}
        {history.weekly.map((w) => (
          <div
            key={w.gw}
            className="grid grid-cols-[56px_minmax(0,1fr)_64px] items-center border-b border-hair py-[13px]"
          >
            <span className="font-mono text-[11px] text-dim">{w.gw}</span>
            <span className="truncate text-[15px] font-medium">{w.name}</span>
            <span className="text-right font-mono text-[13px]">{w.pts}</span>
          </div>
        ))}
      </div>

      <div>
        <h2 className="display m-0 mb-4 text-[32px] tracking-[0.02em]">Monthly winners</h2>
        {history.monthly.length === 0 && (
          <p className="font-mono text-[12px] text-dim">No months settled yet.</p>
        )}
        {history.monthly.map((m) => (
          <div
            key={m.month}
            className="grid grid-cols-[76px_minmax(0,1fr)_64px] items-center border-b border-hair py-[13px]"
          >
            <span className="font-mono text-[11px] text-dim">{m.month}</span>
            <span className="truncate text-[15px] font-medium">{m.name}</span>
            <span className="text-right font-mono text-[13px]">{m.pts}</span>
          </div>
        ))}
        <p className="pt-[22px] font-mono text-[11px] leading-[1.8] text-dim">
          Gameweeks are assigned to a month by the month of their FPL deadline, so months hold
          unequal numbers of gameweeks.
        </p>
      </div>
    </section>
  );
}

export function Leaderboard({ data }: { data: LeaderboardView }) {
  const [tab, setTab] = useState<Tab>('weekly');
  const [event, setEvent] = useState(() => data.weekly.at(-1)?.event ?? 1);
  const [monthKey, setMonthKey] = useState(() => data.monthly.at(-1)?.key ?? '');

  const liveEvent = data.live?.view ? data.live.event : null;
  // The gameweek in play gets a pill of its own, after the settled ones.
  const weeklyPills = [
    ...data.weekly.map((w) => ({ event: w.event, label: w.label })),
    ...(liveEvent !== null ? [{ event: liveEvent, label: `GW${liveEvent}` }] : []),
  ];

  const weekView =
    liveEvent !== null && event === liveEvent
      ? data.live!.view
      : data.weekly.find((w) => w.event === event)?.view;
  const monthView = data.monthly.find((m) => m.key === monthKey)?.view;

  const tabs = data.live ? [...BASE_TABS, { key: 'fixtures' as Tab, label: 'Fixtures' }] : BASE_TABS;

  return (
    <>
      <nav className="flex gap-7 pt-[26px]">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={`cursor-pointer border-b-2 pb-[14px] font-sans text-[13px] font-semibold tracking-[0.1em] uppercase transition-colors ${
              tab === key ? 'border-accent text-ink' : 'border-transparent text-dim hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {data.preseason && tab !== 'fixtures' ? (
        <Preseason preseason={data.preseason} showSearch={data.showSearch} />
      ) : null}

      {!data.preseason && tab === 'weekly' && weeklyPills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-5 pb-1">
          {weeklyPills.map((w) => (
            <Pill
              key={w.event}
              label={w.label}
              active={w.event === event}
              live={w.event === liveEvent}
              onClick={() => setEvent(w.event)}
            />
          ))}
        </div>
      )}

      {!data.preseason && tab === 'monthly' && data.monthly.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-5 pb-1">
          {data.monthly.map((m) => (
            <Pill
              key={m.key}
              label={m.label}
              active={m.key === monthKey}
              onClick={() => setMonthKey(m.key)}
            />
          ))}
        </div>
      )}

      {/* Keyed so switching gameweek, month or tab remounts the table and
          drops you back on page one — a stale page 3 on a one-page table
          would otherwise look like an empty leaderboard. */}
      {!data.preseason && tab === 'weekly' && weekView && <Table key={`weekly-${event}`} view={weekView} showSearch={data.showSearch} />}
      {!data.preseason && tab === 'monthly' && monthView && <Table key={`monthly-${monthKey}`} view={monthView} showSearch={data.showSearch} />}
      {!data.preseason && tab === 'season' && <Table key="season" view={data.season} showSearch={data.showSearch} />}
      {!data.preseason && tab === 'history' && <History history={data.history} />}
      {tab === 'fixtures' && data.live && <Fixtures live={data.live} />}
    </>
  );
}
