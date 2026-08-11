'use client';

import { useState } from 'react';
import type { LeaderboardView, TableView, UiRow } from '@/lib/view';

type Tab = 'weekly' | 'monthly' | 'season' | 'history';

const TABS: { key: Tab; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'season', label: 'Season' },
  { key: 'history', label: 'History' },
];

/** Grid is shared by the header row and every body row so columns line up. */
const GRID = 'grid grid-cols-[44px_minmax(0,1fr)_72px_88px] sm:grid-cols-[44px_minmax(0,1fr)_96px_96px_104px]';

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-[4px] border px-[11px] py-[7px] font-mono text-[11px] tracking-[0.04em] transition-colors ${
        active
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-panel text-dim hover:border-accent hover:text-accent'
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

function Table({ view }: { view: TableView }) {
  return (
    <section className="pt-[26px]">
      {/*
        Title and meta share a baseline row at every width, per section 10.
        On a 412px phone that only fits if the display type gives up a few
        pixels and the meta is kept off a second line.
      */}
      <div className="flex items-baseline justify-between gap-3 pb-4 sm:gap-6">
        <h2 className="display m-0 text-[31px] tracking-[0.02em] sm:text-[32px]">{view.title}</h2>
        <div className="shrink-0 font-mono text-[11px] whitespace-nowrap text-dim">
          {view.meta}
        </div>
      </div>

      <div className={`${GRID} border-b border-line px-3.5 pb-2.5`}>
        <div className="label">#</div>
        <div className="label">Manager</div>
        <div className="label text-right">{view.headers[0]}</div>
        <div className="label text-right">{view.headers[1]}</div>
        <div className="label hidden text-right sm:block">{view.headers[2]}</div>
      </div>

      {view.rows.length === 0 ? (
        <p className="border-b border-hair px-3.5 py-8 font-mono text-[12px] text-dim">
          No scores recorded for this period.
        </p>
      ) : (
        view.rows.map((row) => <Row key={row.entryId} row={row} />)
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

  const weekView = data.weekly.find((w) => w.event === event)?.view;
  const monthView = data.monthly.find((m) => m.key === monthKey)?.view;

  return (
    <>
      <nav className="flex gap-7 pt-[26px]">
        {TABS.map(({ key, label }) => (
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

      {tab === 'weekly' && data.weekly.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-5 pb-1">
          {data.weekly.map((w) => (
            <Pill
              key={w.event}
              label={w.label}
              active={w.event === event}
              onClick={() => setEvent(w.event)}
            />
          ))}
        </div>
      )}

      {tab === 'monthly' && data.monthly.length > 0 && (
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

      {tab === 'weekly' && weekView && <Table view={weekView} />}
      {tab === 'monthly' && monthView && <Table view={monthView} />}
      {tab === 'season' && <Table view={data.season} />}
      {tab === 'history' && <History history={data.history} />}
    </>
  );
}
