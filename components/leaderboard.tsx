'use client';

import { useState } from 'react';
import { Fixtures } from './fixtures';
import { Refresh } from './refresh';
import { SearchBox } from './search-box';
import { Preseason } from './preseason';
import { SquadPanel } from './squad-panel';
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
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  // Selected or not, and nothing else. A gameweek being in play is said by the
  // status pill in the header and by the meta above the table, both in amber —
  // the pills are navigation.
  const selected = 'border-accent bg-accent text-accent-ink';
  const idle = 'border-line bg-panel text-dim hover:border-accent hover:text-accent';

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

function Row({ row, onOpen }: { row: UiRow; onOpen?: () => void }) {
  return (
    <div
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={`${GRID} items-center border-b border-hair px-3.5 py-[15px] transition-colors duration-[120ms] hover:bg-hover ${
        onOpen ? 'cursor-pointer' : ''
      }`}
    >
      <div className="font-mono text-[13px] text-dim">{row.rank}</div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="flex items-center gap-2">
            <span title={row.name} className="truncate text-[16px] font-medium tracking-[-0.01em]">
              {row.name}
            </span>
            {row.isLeader && <span className="h-1.5 w-1.5 flex-none rounded-full bg-pop" />}
          </div>
          <span title={row.team} className="truncate font-mono text-[11px] text-dim">
            {row.team}
          </span>
        </div>
        {row.chip && (
          <span className="flex-none rounded-[3px] border border-line px-1.5 py-[3px] font-mono text-[10px] tracking-[0.08em] text-accent uppercase">
            {row.chip}
          </span>
        )}
      </div>

      <div className="text-right font-mono text-[16px]">{row.c0}</div>
      <div className="text-right font-mono text-[13px] text-dim">{row.c1}</div>
      {/* Below 640px the table drops to two numeric columns. */}
      <div className="hidden text-right font-mono text-[13px] text-dim sm:block">{row.c2}</div>
    </div>
  );
}

/** Amber while a gameweek is in play, so a provisional table reads as one. */
function Meta({ view }: { view: TableView }) {
  return (
    <div className={`font-mono text-[11px] ${view.provisional ? 'text-amber' : 'text-dim'}`}>
      {view.meta}
    </div>
  );
}

function Table({
  view,
  showSearch,
  refresh,
  onOpenSquad,
}: {
  view: TableView;
  showSearch: boolean;
  /** Present only on the gameweek in play. */
  refresh?: { fetchedAt: string; intervalSeconds?: number };
  /** Absent when there is no gameweek whose squad could be shown. */
  onOpenSquad?: (manager: { entryId: number; name: string; team: string }) => void;
}) {
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
        Meta always sits under the title. It describes the table, so it belongs
        with its name rather than moving to the opposite corner depending on
        whether a search box happens to be shown.
      */}
      <div className="flex flex-col items-stretch gap-3 pb-[18px] sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex flex-col gap-[7px]">
          <h2 className="display m-0 text-[32px] tracking-[0.02em]">{view.title}</h2>
          <Meta view={view} />
        </div>

        <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
          {refresh && <Refresh fetchedAt={refresh.fetchedAt} intervalSeconds={refresh.intervalSeconds} />}
          {showSearch && (
            <SearchBox
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(0);
              }}
              matches={rows.length}
            />
          )}
        </div>
      </div>

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
        visible.map((row) => (
          <Row
            key={row.entryId}
            row={row}
            onOpen={
              onOpenSquad
                ? () => onOpenSquad({ entryId: row.entryId, name: row.name, team: row.team })
                : undefined
            }
          />
        ))
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
            <span title={w.name} className="truncate text-[15px] font-medium">
              {w.name}
            </span>
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
            <span title={m.name} className="truncate text-[15px] font-medium">
              {m.name}
            </span>
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
  // Name and team ride along so the panel header is right on the first frame.
  const [open, setOpen] = useState<{ entryId: number; name: string; team: string } | null>(null);

  const liveEvent = data.live?.view ? data.live.event : null;

  /**
   * Which gameweek's squad a row opens.
   *
   * On the weekly tab it is whichever gameweek is being read. The season and
   * monthly tables span several, so the newest stands in — a squad has to
   * belong to one gameweek, and the latest is the one people mean.
   */
  const latestEvent = liveEvent ?? data.weekly.at(-1)?.event ?? data.live?.event ?? null;
  const squadEvent = tab === 'weekly' ? event : latestEvent;
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

  // Any table showing points from the gameweek in play can be refreshed.
  const liveRefresh = data.live
    ? {
        fetchedAt: data.live.fetchedAt,
        intervalSeconds:
          data.live.inPlay && data.refreshSeconds ? data.refreshSeconds : undefined,
      }
    : undefined;

  return (
    <>
      {/*
        Five tabs do not fit a phone. The nav scrolls inside itself rather than
        letting the page scroll sideways, and the buttons refuse to shrink so
        labels never truncate mid-word.
      */}
      <nav className="-mx-5 flex gap-3.5 overflow-x-auto px-5 pt-[26px] [scrollbar-width:none] sm:mx-0 sm:gap-7 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={`shrink-0 cursor-pointer border-b-2 pb-[14px] font-sans text-[12px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase transition-colors sm:text-[13px] sm:tracking-[0.1em] ${
              tab === key ? 'border-accent text-ink' : 'border-transparent text-dim hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {data.preseason && tab !== 'fixtures' ? (
        <Preseason
          preseason={data.preseason}
          showSearch={data.showSearch}
          onOpenSquad={squadEvent === null ? undefined : setOpen}
        />
      ) : null}

      {!data.preseason && tab === 'weekly' && weeklyPills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-5 pb-1">
          {weeklyPills.map((w) => (
            <Pill
              key={w.event}
              label={w.label}
              active={w.event === event}
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
      {!data.preseason && tab === 'weekly' && weekView && (
        <Table
          key={`weekly-${event}`}
          view={weekView}
          showSearch={data.showSearch}
          refresh={liveEvent !== null && event === liveEvent ? liveRefresh : undefined}
          onOpenSquad={squadEvent === null ? undefined : setOpen}
        />
      )}
      {!data.preseason && tab === 'monthly' && monthView && (
        <Table
          key={`monthly-${monthKey}`}
          view={monthView}
          showSearch={data.showSearch}
          refresh={monthView.provisional ? liveRefresh : undefined}
          onOpenSquad={squadEvent === null ? undefined : setOpen}
        />
      )}
      {!data.preseason && tab === 'season' && (
        <Table
          key="season"
          view={data.season}
          showSearch={data.showSearch}
          refresh={data.season.provisional ? liveRefresh : undefined}
          onOpenSquad={squadEvent === null ? undefined : setOpen}
        />
      )}
      {!data.preseason && tab === 'history' && <History history={data.history} />}

      {open !== null && squadEvent !== null && (
        <SquadPanel
          entryId={open.entryId}
          event={squadEvent}
          name={open.name}
          team={open.team}
          onClose={() => setOpen(null)}
        />
      )}
      {tab === 'fixtures' && data.live && (
        <Fixtures live={data.live} refreshSeconds={data.refreshSeconds} />
      )}
    </>
  );
}
