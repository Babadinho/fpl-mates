'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

function label(refreshing: boolean, fetchedAt: string): string {
  if (refreshing) return 'Refreshing';
  const minutes = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 60_000);
  if (minutes < 1) return 'Updated just now';
  return `Updated ${minutes} ${minutes === 1 ? 'min' : 'mins'} ago`;
}

/**
 * `fetchedAt` is when the server called the FPL API, not when this mounted —
 * so the label survives a refresh without the client tracking anything.
 */
export function Refresh({
  fetchedAt,
  intervalSeconds,
}: {
  fetchedAt: string;
  intervalSeconds?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [, tick] = useState(0);

  // Relative time differs between server and client render; wait for hydration.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!intervalSeconds) return;
    const id = setInterval(() => {
      // Skip while backgrounded.
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [intervalSeconds, router]);

  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-[11px] whitespace-nowrap text-dim">
        {mounted ? label(pending, fetchedAt) : ''}
      </span>
      <button
        type="button"
        onClick={() => !pending && startTransition(() => router.refresh())}
        disabled={pending}
        title="Refresh scores"
        aria-label="Refresh scores"
        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-line bg-panel p-0 transition-colors duration-[120ms] ${
          pending
            ? 'cursor-default text-dim'
            : 'cursor-pointer text-ink hover:border-accent hover:text-accent'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="block h-3.5 w-3.5 origin-center"
          style={pending ? { animation: 'fplspin 900ms linear infinite' } : undefined}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 4 21 10 15 10" />
        </svg>
      </button>
    </div>
  );
}
