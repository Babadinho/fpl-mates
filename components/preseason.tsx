'use client';

import { useEffect, useMemo, useState } from 'react';
import { PAGE_SIZE, type LeaderboardView } from '@/lib/view';
import { SearchBox } from './search-box';

/** Returned once the deadline has passed, so the caller can say so. */
export const EXPIRED = 'expired';

/** Counts down to the first deadline. Null until mounted, so SSR matches. */
function useCountdown(iso: string | null) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!iso || now === null) return null;

  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return EXPIRED;

  const pad = (n: number) => String(n).padStart(2, '0');
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000) % 24;
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;

  return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

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
        enabled
          ? 'cursor-pointer text-ink hover:border-accent hover:text-accent'
          : 'cursor-default text-dim opacity-45'
      }`}
    >
      {label}
    </button>
  );
}

export function Preseason({
  preseason,
  showSearch,
  onOpenSquad,
}: {
  preseason: NonNullable<LeaderboardView['preseason']>;
  showSearch: boolean;
  /** Absent when no gameweek is known, so there is nothing a row could open. */
  onOpenSquad?: (entryId: number) => void;
}) {
  const countdown = useCountdown(preseason.deadline);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? preseason.joined.rows.filter((r) => `${r.name} ${r.team}`.toLowerCase().includes(q))
        : preseason.joined.rows,
    [q, preseason.joined.rows],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  const GRID = 'grid grid-cols-[30px_minmax(0,1fr)_84px] sm:grid-cols-[44px_minmax(0,1fr)_200px_120px]';

  return (
    <section className="flex flex-col items-start gap-3.5 pt-16">
      {/*
        `w-fit` sizes this block to its widest child, which is the heading.
        The note then carries `w-0 min-w-full`: w-0 stops it contributing to
        that intrinsic width, min-w-full makes it fill it. Net effect — the
        note wraps to exactly the heading's width, whatever the date says,
        with no measurement and no magic number.
      */}
      <div className="flex w-fit flex-col items-start gap-3.5">
        <span className="label">{preseason.label}</span>
        <h2 className="display m-0 text-[44px] tracking-[0.02em]">{preseason.title}</h2>
        {/*
          Between the deadline and the first kickoff there is nothing to rank,
          so this section still stands — but a countdown of zeros reads as a
          stuck clock rather than a passed deadline.
        */}
        <span className="font-mono text-[13px] text-accent">
          {countdown === null
            ? 'Counting down to Gameweek 1'
            : countdown === EXPIRED
              ? 'Teams are locked. Scores appear at the first kickoff.'
              : `${countdown} to the Gameweek 1 deadline`}
        </span>
        <p className="mt-1.5 w-0 min-w-full text-[15px] leading-[1.6] text-dim">
          {preseason.note}
        </p>
      </div>

      <div className="w-full pt-12">
        {/* Meta moves under the heading only when the search takes the right. */}
        <div
          className={`flex flex-col items-stretch gap-3 pb-[18px] sm:flex-row sm:justify-between sm:gap-6 ${
            showSearch ? 'sm:items-end' : 'sm:items-baseline'
          }`}
        >
          <div className="flex flex-col gap-[7px]">
            <h3 className="display m-0 text-[28px] tracking-[0.02em]">{preseason.joined.heading}</h3>
            {showSearch && (
              <span className="font-mono text-[11px] text-dim">{preseason.joined.meta}</span>
            )}
          </div>

          {showSearch ? (
            <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
              <SearchBox
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setPage(0);
                }}
                matches={filtered.length}
              />
            </div>
          ) : (
            <span className="font-mono text-[11px] whitespace-nowrap text-dim">
              {preseason.joined.meta}
            </span>
          )}
        </div>

        <div className={`${GRID} border-b border-line px-3.5 pb-2.5`}>
          <div className="label">#</div>
          <div className="label">Manager</div>
          {/* Team folds into the manager cell on phones. */}
          <div className="label hidden sm:block">Team</div>
          <div className="label text-right">Joined</div>
        </div>

        {visible.length === 0 ? (
          <p className="border-b border-hair px-3.5 py-8 font-mono text-[12px] text-dim">
            {q ? `No manager matches "${query.trim()}".` : 'Nobody has joined yet.'}
          </p>
        ) : (
          visible.map((row) => (
            <div
              key={row.num + row.name}
              onClick={onOpenSquad ? () => onOpenSquad(row.entryId) : undefined}
              role={onOpenSquad ? 'button' : undefined}
              tabIndex={onOpenSquad ? 0 : undefined}
              onKeyDown={
                onOpenSquad
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenSquad(row.entryId);
                      }
                    }
                  : undefined
              }
              className={`${GRID} items-center border-b border-hair p-3.5 transition-colors duration-[120ms] hover:bg-hover ${
                onOpenSquad ? 'cursor-pointer' : ''
              }`}
            >
              <div className="font-mono text-[13px] text-dim">{row.num}</div>
              <div className="min-w-0">
                <div className="truncate text-[16px] font-medium tracking-[-0.01em]">
                  {row.name}
                </div>
                <div className="truncate font-mono text-[12.5px] text-dim sm:hidden">
                  {row.team}
                </div>
              </div>
              <div className="hidden truncate font-mono text-[13px] text-dim sm:block">
                {row.team}
              </div>
              <div className="text-right">
                <div className="font-mono text-[13px]">{row.joined}</div>
                <div className="font-mono text-[11px] text-dim">{row.time}</div>
              </div>
            </div>
          ))
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex flex-col items-start gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span className="font-mono text-[11px] text-dim">
              {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
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
      </div>
    </section>
  );
}
