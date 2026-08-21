'use client';

import { useEffect, useState } from 'react';
import type { FixtureDetail, FixtureEvent } from '@/lib/fixture';

function EventRow({ event }: { event: FixtureEvent }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-hair py-2.5">
      <span
        className={`w-9 flex-none font-mono text-[11px] tracking-[0.06em] ${
          event.home ? 'text-ink' : 'text-dim'
        }`}
      >
        {event.club}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{event.name}</span>
      {event.detail && (
        <span className="flex-none font-mono text-[10px] tracking-[0.06em] text-dim">
          {event.detail}
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  events,
  empty,
}: {
  title: string;
  events: FixtureEvent[];
  empty: string;
}) {
  return (
    <div>
      <h4 className="mb-1.5 font-mono text-[10px] font-normal tracking-[0.16em] text-dim uppercase">
        {title}
      </h4>
      {events.length === 0 ? (
        <p className="py-2.5 font-mono text-[11px] text-dim">{empty}</p>
      ) : (
        events.map((e, i) => <EventRow key={`${e.name}-${i}`} event={e} />)
      )}
    </div>
  );
}

export function FixturePanel({
  event,
  fixtureId,
  onClose,
}: {
  event: number;
  fixtureId: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<FixtureDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);

    fetch(`/api/fixture?event=${event}&id=${fixtureId}`)
      .then(async (res) => {
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) setDetail(body as FixtureDetail);
        else setError((body as { error?: string }).error ?? 'Could not load this fixture.');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load this fixture.');
      });

    return () => {
      cancelled = true;
    };
  }, [event, fixtureId]);

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
      <div onClick={onClose} aria-hidden="true" className="fpl-scrim absolute inset-0 bg-[rgba(12,8,20,0.44)]" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Fixture detail"
        className="fpl-panel relative h-full w-full max-w-full overflow-y-auto overscroll-contain border-l border-line bg-bg px-[18px] pt-[22px] pb-10 shadow-[-24px_0_60px_rgba(12,8,20,0.18)] will-change-transform sm:w-[460px] sm:px-[30px] sm:pt-[30px] sm:pb-[46px]"
      >
        <div className="flex items-start justify-between gap-5 border-b border-line pb-5">
          <div className="flex flex-col gap-1.5">
            <h3 className="display m-0 text-[34px] tracking-[0.02em]">{detail?.title ?? ' '}</h3>
            <span className={`font-mono text-[11px] ${detail?.live ? 'text-amber' : 'text-dim'}`}>
              {detail?.status ?? ''}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-bg text-ink hover:border-accent hover:text-accent"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              className="block h-3 w-3"
            >
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>

        {error && <p className="pt-6 font-mono text-[12px] text-dim">{error}</p>}

        {!detail && !error && (
          <div className="flex flex-col gap-3 pt-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="fpl-skeleton h-[34px] bg-hair" />
            ))}
          </div>
        )}

        {detail && (
          <>
            <div className="flex flex-col gap-[26px] pt-[22px]">
              <Section title="Goals" events={detail.goals} empty="None yet." />
              <Section title="Assists" events={detail.assists} empty="None yet." />
              <Section title="Cards" events={detail.cards} empty="None." />

              <div>
                <Section
                  title={detail.bonusConfirmed ? 'Bonus' : 'Bonus — provisional'}
                  events={detail.bonus}
                  empty="Not decided yet."
                />
                <p className="pt-3 font-mono text-[10px] text-dim">
                  {detail.bonusConfirmed
                    ? 'Awarded by FPL.'
                    : 'Estimated from the bonus points system while the match is on. It can change.'}
                </p>
              </div>
            </div>

            <h4 className="mt-[26px] mb-1.5 font-mono text-[10px] font-normal tracking-[0.16em] text-dim uppercase">
              Who played
            </h4>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {detail.lineups.map((side) => (
                <div key={side.club}>
                  <span className="font-mono text-[11px] tracking-[0.1em] text-ink">
                    {side.club}
                  </span>
                  {side.players.map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-2.5 border-b border-hair py-2.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                        {p.name}
                      </span>
                      <span className="flex-none font-mono text-[10px] tracking-[0.06em] text-dim">
                        {p.role}
                      </span>
                      <span className="w-[34px] flex-none text-right font-mono text-[11px] text-dim">
                        {p.minutes}&apos;
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/*
              Said plainly because its absence is conspicuous: every other
              football app puts a minute beside a goal, and FPL's fixture stats
              carry no timestamps at all.
            */}
            <p className="mt-3.5 font-mono text-[10px] leading-[1.7] text-dim">
              FPL does not publish the minute an event happened, so these are listed rather than
              ordered. Anyone who came on and played no minutes will not appear.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
