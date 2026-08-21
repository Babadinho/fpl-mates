'use client';

import { useEffect, useState } from 'react';
import { FixturePanel } from './fixture-panel';
import { Refresh } from './refresh';
import type { LeaderboardView } from '@/lib/view';

/** Ticks once a second so the deadline countdown stays live. */
function useCountdown(iso: string | null) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Null until mounted, so the server and first client render agree.
  if (!iso || now === null) return null;

  const ms = Math.max(0, new Date(iso).getTime() - now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000) % 24;
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;

  return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function Fixtures({
  live,
  refreshSeconds,
}: {
  live: NonNullable<LeaderboardView['live']>;
  refreshSeconds: number | null;
}) {
  const countdown = useCountdown(live.nextDeadline);
  const [openFixture, setOpenFixture] = useState<number | null>(null);

  return (
    <section className="pt-[30px]">
      <div className="flex flex-col items-start gap-2 pb-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-5">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-baseline sm:gap-4">
          <h2 className="display m-0 text-[32px] tracking-[0.02em]">Gameweek {live.event}</h2>
          <span className="font-mono text-[11px] text-dim">
            {countdown ? `Deadline in ${countdown}` : 'Deadline'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-[0.1em] text-dim uppercase">
            {live.stateLabel}
          </span>
          {/* Only auto-refreshes while something is actually being played. */}
          <Refresh
            fetchedAt={live.fetchedAt}
            intervalSeconds={live.inPlay && refreshSeconds ? refreshSeconds : undefined}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-b border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {live.fixtures.map((fx) => (
          <div
            key={fx.id}
            onClick={() => setOpenFixture(fx.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpenFixture(fx.id);
              }
            }}
            className="flex cursor-pointer flex-col gap-2 bg-bg px-3.5 py-[18px] transition-colors duration-[120ms] hover:bg-hover"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[12px] tracking-[0.06em] text-ink">{fx.home}</span>
              <span
                className={`font-mono text-[10px] tracking-[0.1em] ${
                  fx.started && !fx.finished ? 'text-amber' : 'text-dim'
                }`}
              >
                {fx.clock}
              </span>
            </div>
            <div className={`font-mono text-[14px] ${fx.started ? 'text-ink' : 'text-dim'}`}>
              {fx.score}
            </div>
            <span className="font-mono text-[12px] tracking-[0.06em] text-ink">{fx.away}</span>
          </div>
        ))}
      </div>

      <p className="pt-[18px] font-mono text-[11px] leading-[1.7] text-dim">{live.note}</p>

      {openFixture !== null && (
        <FixturePanel
          event={live.event}
          fixtureId={openFixture}
          onClose={() => setOpenFixture(null)}
        />
      )}
    </section>
  );
}
