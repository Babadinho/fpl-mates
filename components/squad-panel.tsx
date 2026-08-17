'use client';

import { useEffect, useState } from 'react';
import type { SquadPlayer, SquadView } from '@/lib/squad';

/** Colour by how the player's own fixture is going. */
function stateClass(state: SquadPlayer['state']): string {
  if (state === 'playing') return 'text-amber';
  if (state === 'done') return 'text-ink';
  return 'text-dim';
}

function Row({ player }: { player: SquadPlayer }) {
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_62px_52px] items-center gap-2.5 border-b border-hair py-[11px]">
      <span className="font-mono text-[10px] tracking-[0.1em] text-dim">{player.order}</span>

      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`truncate text-[15px] font-medium tracking-[-0.01em] ${
            player.benched ? 'text-dim' : 'text-ink'
          }`}
        >
          {player.name}
        </span>
        {player.badge && (
          <span
            className={`flex-none rounded-[3px] border px-[5px] py-[2px] font-mono text-[9px] tracking-[0.1em] ${
              player.isCaptain ? 'border-accent text-accent' : 'border-line text-dim'
            }`}
          >
            {player.badge}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-[2px]">
        <span className="font-mono text-[11px] tracking-[0.06em] text-dim">{player.club}</span>
        <span className={`font-mono text-[11px] ${stateClass(player.state)}`}>
          {player.minutes === null ? 'Not started' : `${player.minutes}'`}
        </span>
      </div>

      <span
        className={`text-right font-mono text-[15px] ${player.benched ? 'text-dim' : 'text-ink'}`}
      >
        {player.points}
      </span>
    </div>
  );
}

function Skeleton() {
  const rows = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <>
      <div className="flex items-center gap-2.5 pt-6 pb-5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="block h-[13px] w-[13px] animate-[fplspin_900ms_linear_infinite] text-dim"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 4 21 10 15 10" />
        </svg>
        <span className="font-mono text-[11px] tracking-[0.1em] text-dim uppercase">
          Loading squad
        </span>
      </div>

      {/* Same four columns as the real strip, so it does not shift on arrival. */}
      <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-[9px] bg-bg py-4 pr-3">
            <div className="fpl-skeleton h-2 w-3/5 bg-hair" />
            <div className="fpl-skeleton h-[15px] w-[46%] bg-line" />
          </div>
        ))}
      </div>

      {rows.map((i) => (
        <div
          key={i}
          className="grid grid-cols-[34px_minmax(0,1fr)_62px_52px] items-center gap-2.5 border-b border-hair py-3.5"
        >
          <div className="fpl-skeleton h-2 bg-hair" />
          <div className="fpl-skeleton h-[11px] w-[62%] bg-line" />
          <div className="fpl-skeleton h-2 w-[70%] bg-hair" />
          <div className="fpl-skeleton h-[11px] w-3/5 justify-self-end bg-hair" />
        </div>
      ))}
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 bg-bg py-4 pl-3 first:pl-0">
      <span className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">{label}</span>
      <span className={`font-mono text-[19px] ${accent ? 'text-accent' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

export function SquadPanel({
  entryId,
  event,
  name,
  team,
  onClose,
}: {
  entryId: number;
  event: number;
  /** Known from the row already, so the header never renders empty. */
  name: string;
  team: string;
  onClose: () => void;
}) {
  const [squad, setSquad] = useState<SquadView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSquad(null);
    setError(null);

    fetch(`/api/squad?entry=${entryId}&event=${event}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) setSquad(body as SquadView);
        else setError((body as { error?: string }).error ?? 'Could not load this squad.');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this squad.');
      });

    return () => {
      cancelled = true;
    };
  }, [entryId, event]);

  // Escape closes, and the page behind must not scroll while this is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fpl-scrim absolute inset-0 bg-[rgba(12,8,20,0.44)]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Manager squad"
        className="fpl-panel relative h-full w-full max-w-full overflow-y-auto overscroll-contain border-l border-line bg-bg px-[18px] pt-[22px] pb-10 shadow-[-24px_0_60px_rgba(12,8,20,0.18)] will-change-transform sm:w-[460px] sm:px-[30px] sm:pt-[30px] sm:pb-[46px]"
      >
        <div className="flex items-start justify-between gap-5 border-b border-line pb-[22px]">
          <div className="flex min-w-0 flex-col gap-[7px]">
            <span
              className={`font-mono text-[11px] tracking-[0.06em] ${
                squad?.live ? 'text-amber' : 'text-dim'
              }`}
            >
              Gameweek {event}
              {squad?.live ? ' · in play' : squad?.state === 'pending' ? ' · not yet picked' : ''}
            </span>
            <h2 className="display m-0 text-[36px] leading-[0.95] tracking-[0.02em]">
              {squad?.name ?? name}
            </h2>
            <span className="truncate font-mono text-[12px] text-dim">{squad?.team ?? team}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="flex h-[34px] w-[34px] flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-panel text-ink hover:border-accent hover:text-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              className="block h-[13px] w-[13px]"
            >
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>

        {error && <p className="pt-11 font-mono text-[12px] text-dim">{error}</p>}

        {!squad && !error && <Skeleton />}

        {squad?.state === 'pending' && (
          <div className="flex flex-col gap-3 pt-11 pb-2">
            <h3 className="display m-0 text-[30px] tracking-[0.02em]">Not public yet</h3>
            <p className="m-0 max-w-[40ch] text-[15px] leading-[1.6] text-dim">
              Teams can still be changed until the Gameweek {event} deadline, and FPL keeps them
              private until then — even from your own league. This shows the full fifteen once it
              passes.
            </p>
          </div>
        )}

        {squad?.state === 'locked' && (
          <div className="flex flex-col gap-3 pt-11 pb-2">
            <h3 className="display m-0 text-[30px] tracking-[0.02em]">No points yet</h3>
            <p className="m-0 max-w-[40ch] text-[15px] leading-[1.6] text-dim">
              The deadline has passed and this squad is locked, but no fixture has kicked off.
              Points, minutes and bonus appear as matches start.
            </p>
          </div>
        )}

        {squad?.state === 'ready' && (
          <>
            <div className="grid grid-cols-4 gap-px border-b border-line bg-line">
              <Stat label="Gross" value={String(squad.gross)} />
              <Stat label="Hits" value={squad.cost ? `−${squad.cost}` : '0'} />
              <Stat label="Net" value={String(squad.net)} accent />
              <Stat label="Shape" value={squad.formation} />
            </div>

            {squad.chip && (
              <div className="flex items-center gap-2.5 border-b border-line py-3.5">
                <span className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">
                  Chip
                </span>
                <span className="font-mono text-[11px] tracking-[0.08em] text-accent">
                  {squad.chip}
                </span>
              </div>
            )}

            <h3 className="mt-[26px] mb-1 font-mono text-[10px] font-normal tracking-[0.16em] text-dim uppercase">
              Starting XI
            </h3>
            {squad.xi.map((p, i) => (
              <Row key={`${p.name}-${i}`} player={p} />
            ))}

            <h3 className="mt-[26px] mb-1 font-mono text-[10px] font-normal tracking-[0.16em] text-dim uppercase">
              {squad.chip === 'Bench Boost' ? 'Bench Boost — all four score' : 'Substitutes, in order'}
            </h3>
            {squad.bench.map((p, i) => (
              <Row key={`${p.name}-${i}`} player={p} />
            ))}

            <p className="mt-5 font-mono text-[11px] leading-[1.7] text-dim">
              {squad.live
                ? 'Points and bonus are provisional while fixtures are in play.'
                : 'Final. Bonus confirmed by FPL.'}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
