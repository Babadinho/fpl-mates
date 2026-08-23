'use client';

import { useEffect, useState } from 'react';
import type { HeroCell } from '@/lib/view';
import type { ShareScope } from '@/lib/share';
import { ShareCard } from './share-card';

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

function Cell({ cell, onShare }: { cell: HeroCell; onShare?: () => void }) {
  const countdown = useKickoff(cell.countdownTo);

  return (
    <div className="flex flex-col gap-3 bg-bg px-6 pt-[26px] pb-7">
      <div className="label">{cell.label}</div>
      <div className="display text-[38px] tracking-[0.01em]">{cell.name}</div>
      <div className="flex items-baseline gap-2.5 font-mono text-[12px] text-dim">
        <span className="text-[15px] text-accent">{cell.value}</span>
        <span>{countdown ? `first kickoff in ${countdown}` : cell.sub}</span>
      </div>

      {onShare && (
        <button
          type="button"
          onClick={onShare}
          title="Share as an image"
          className="mt-1 flex w-fit cursor-pointer items-center gap-1.5 rounded-[4px] border border-line bg-panel px-2.5 py-1.5 font-mono text-[10px] tracking-[0.1em] text-dim uppercase transition-colors hover:border-accent hover:text-accent"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="block h-[11px] w-[11px] flex-none"
          >
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <polyline points="8 8 12 4 16 8" />
            <line x1="12" y1="4" x2="12" y2="15" />
          </svg>
          <span>Share</span>
        </button>
      )}
    </div>
  );
}

const SCOPES: ShareScope[] = ['weekly', 'monthly', 'season'];

export function Hero({
  hero,
  canShare,
}: {
  hero: NonNullable<HeroCell[]>;
  /** False until something has settled — there is no sharing a result that
      could still change, which is why the poller waits for data_checked. */
  canShare: boolean;
}) {
  const [sharing, setSharing] = useState<ShareScope | null>(null);

  return (
    <section className="grid grid-cols-1 gap-px border-b border-line bg-line sm:grid-cols-3">
      {hero.map((cell, i) => (
        <Cell
          key={cell.label}
          cell={cell}
          onShare={canShare ? () => setSharing(SCOPES[i]) : undefined}
        />
      ))}

      {sharing && <ShareCard scope={sharing} onClose={() => setSharing(null)} />}
    </section>
  );
}
