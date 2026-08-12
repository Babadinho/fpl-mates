'use client';

import { useEffect, useMemo, useState } from 'react';
import { PAGE_SIZE, type LeaderboardView } from '@/lib/view';

/** Counts down to the first deadline. Null until mounted, so SSR matches. */
function useCountdown(iso: string | null) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!iso || now === null) return null;

  const ms = Math.max(0, new Date(iso).getTime() - now);
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
}: {
  preseason: NonNullable<LeaderboardView['preseason']>;
  showSearch: boolean;
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
      <span className="label">{preseason.label}</span>
      <h2 className="display m-0 text-[44px] tracking-[0.02em]">{preseason.title}</h2>
      <span className="font-mono text-[13px] text-accent">
        {countdown ? `${countdown} to the Gameweek 1 deadline` : 'Counting down to Gameweek 1'}
      </span>
      {/* The design specifies 46ch, but our copy is longer than the export's
          and broke to three cramped lines. 70ch is still inside a comfortable
          reading measure and settles it at two. */}
      <p className="mt-1.5 max-w-[70ch] text-[15px] leading-[1.6] text-dim">{preseason.note}</p>

      <div className="w-full pt-12">
        <div className="flex items-baseline justify-between gap-6 pb-4">
          <h3 className="display m-0 text-[28px] tracking-[0.02em]">{preseason.joined.heading}</h3>
          <span className="font-mono text-[11px] text-dim">{preseason.joined.meta}</span>
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
              className={`${GRID} items-center border-b border-hair p-3.5 transition-colors duration-[120ms] hover:bg-hover`}
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
