import { ThemeToggle } from '@/components/theme-toggle';
import { getConfig, TIEBREAK_LABELS } from '@/lib/config';
import { getSeasonState } from '@/lib/db/queries';

// Read fresh from Postgres on each request; the poller writes on its own cadence.
export const dynamic = 'force-dynamic';

function formatDeadline(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default async function Page() {
  const cfg = getConfig();
  const state = await getSeasonState();
  const seasonStarted = state.lastSettled !== null;

  return (
    <div className="min-h-screen px-8 pb-24">
      <div className="mx-auto max-w-[1060px]">
        {/* ---------------------------------------------------------- header */}
        <header className="flex items-end justify-between gap-8 border-b border-line pt-11 pb-[34px]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="block h-[22px] w-[22px] rounded-[4px] bg-accent" />
              <span className="font-mono text-[11px] tracking-[0.18em] text-dim uppercase">
                {cfg.site.eyebrow} · {state.seasonLabel}
              </span>
            </div>
            <h1 className="display m-0 text-[66px] tracking-[0.005em]">{state.leagueName}</h1>
          </div>

          <div className="flex flex-col items-end gap-2.5 pb-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-[7px]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: seasonStarted ? 'var(--pop)' : 'var(--dim)' }}
                />
                <span className="font-mono text-[11px] tracking-[0.06em] text-ink">
                  {seasonStarted ? `GW ${state.lastSettled!.event} SETTLED` : 'PRE-SEASON'}
                </span>
              </div>
              <ThemeToggle />
            </div>
            <div className="font-mono text-[11px] text-dim">
              {state.nextDeadline
                ? `GW ${state.nextDeadline.event} deadline ${formatDeadline(state.nextDeadline.deadlineTime, cfg.rules.timezone)}`
                : 'season complete'}
            </div>
          </div>
        </header>

        {/* ------------------------------------------------------ empty state */}
        {/* Before GW1 there is nothing to rank, so the hero strip is replaced
            rather than shown empty (see docs/HANDOFF.md). */}
        <section className="border-b border-line py-14">
          <p className="display m-0 text-[38px] tracking-[0.01em]">No gameweeks scored yet</p>
          <p className="mt-4 max-w-[52ch] font-mono text-[12px] leading-[1.9] text-dim">
            {state.nextDeadline
              ? `Season starts with GW1 on ${formatDeadline(state.nextDeadline.deadlineTime, cfg.rules.timezone)}. Weekly and monthly tables appear here once bonus points are applied and the gameweek settles.`
              : 'Waiting for the fixture list.'}
          </p>
        </section>

        {/* ----------------------------------------------------------- roster */}
        <section className="pt-8">
          <div className="flex items-baseline justify-between gap-6 pb-4">
            <h2 className="display m-0 text-[32px] tracking-[0.02em]">In the league</h2>
            <span className="font-mono text-[11px] text-dim">
              {state.members.length} {state.members.length === 1 ? 'manager' : 'managers'}
            </span>
          </div>

          <div className="grid grid-cols-[44px_minmax(0,1fr)_104px] border-b border-line px-3.5 pb-2.5">
            <div className="label">#</div>
            <div className="label">Manager</div>
            <div className="label text-right">Joined</div>
          </div>

          {state.members.map((m, i) => (
            <div
              key={m.entryId}
              className="grid grid-cols-[44px_minmax(0,1fr)_104px] items-center border-b border-hair px-3.5 py-[15px] transition-colors duration-[120ms] hover:bg-hover"
            >
              <div className="font-mono text-[13px] text-dim">{String(i + 1).padStart(2, '0')}</div>
              <div className="flex min-w-0 flex-col gap-[3px]">
                <span className="truncate text-[16px] font-medium tracking-[-0.01em]">
                  {m.playerName}
                </span>
                <span className="truncate font-mono text-[11px] text-dim">{m.entryName}</span>
              </div>
              <div className="text-right font-mono text-[13px] text-dim">GW{m.joinedGw}</div>
            </div>
          ))}

          <p className="px-3.5 pt-[18px] font-mono text-[11px] leading-[1.7] text-dim">
            Weekly winners are decided on net points — gross points minus transfer cost. Ties break
            on {cfg.rules.tiebreakOrder.slice(1).map((k) => TIEBREAK_LABELS[k]).join(', then ')}, then
            the win is shared.
            {!cfg.rules.countPrejoinGws &&
              ' Managers score only from the gameweek they joined the league.'}
          </p>
        </section>

        {/* ---------------------------------------------------------- footer */}
        <footer className="mt-16 flex items-center justify-between gap-6 border-t border-line pt-[22px] font-mono text-[11px] text-dim">
          <span>Scores settle on data_checked · {state.totalGameweeks} gameweeks loaded</span>
          <span>{cfg.whatsapp ? 'Also posts to WhatsApp when a gameweek settles' : 'Web only'}</span>
        </footer>
      </div>
    </div>
  );
}
