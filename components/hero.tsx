'use client';

import { useEffect, useState } from 'react';
import type { HeroCell } from '@/lib/view';

/**
 * Counts down to kickoff, or returns null when there is nothing to count to.
 *
 * Null until mounted so the server and client render the same thing — a clock
 * rendered on the server is wrong by the time it reaches the browser.
 */
function useKickoff(iso: string | null | undefined) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!iso) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);

  if (!iso || now === null) return null;

  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;

  const pad = (n: number) => String(n).padStart(2, '0');
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

function Cell({ cell }: { cell: HeroCell }) {
  const countdown = useKickoff(cell.countdownTo);

  return (
    <div className="flex flex-col gap-3 bg-bg px-6 pt-[26px] pb-7">
      <div className="label">{cell.label}</div>
      <div className="display text-[38px] tracking-[0.01em]">{cell.name}</div>
      <div className="flex items-baseline gap-2.5 font-mono text-[12px] text-dim">
        <span className="text-[15px] text-accent">{cell.value}</span>
        <span>{countdown ? `first kickoff in ${countdown}` : cell.sub}</span>
      </div>
    </div>
  );
}

export function Hero({ hero }: { hero: NonNullable<HeroCell[]> }) {
  return (
    <section className="grid grid-cols-1 gap-px border-b border-line bg-line sm:grid-cols-3">
      {hero.map((cell) => (
        <Cell key={cell.label} cell={cell} />
      ))}
    </section>
  );
}
