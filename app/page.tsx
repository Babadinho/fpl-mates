import { Gate } from '@/components/gate';
import { Hero } from '@/components/hero';
import { Leaderboard } from '@/components/leaderboard';
import { ThemeToggle } from '@/components/theme-toggle';
import { hasAccess, rememberedFor } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getLeaderboardView } from '@/lib/view';
import { SOURCE_URL } from '@/lib/app';

// Read fresh on each request; the poller writes on its own cadence.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const cfg = getConfig();

  // Gated at the page, not in middleware, so /api/poll stays reachable by cron
  // and the share-preview image still renders for a link posted in the group.
  if (!(await hasAccess())) {
    const { leagueName } = await getLeaderboardView();
    return <Gate leagueName={leagueName} eyebrow={cfg.site.eyebrow} rememberedFor={rememberedFor()} />;
  }

  const data = await getLeaderboardView();

  return (
    <div className="min-h-screen px-5 pb-24 sm:px-8">
      <div className="mx-auto max-w-[1060px]">
        {/* ---------------------------------------------------------- header */}
        <header className="flex flex-col gap-6 border-b border-line pt-7 pb-[34px] sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:pt-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="block h-[22px] w-[22px] rounded-[4px] bg-accent" />
              {/* League size lives here, not on the table meta line: that one
                  counts managers in the table, which is a different and
                  correctly smaller number once people join mid-season. */}
              <span className="font-mono text-[11px] tracking-[0.18em] text-dim uppercase">
                {data.eyebrow} · {data.seasonLabel} · {data.managerCount}{' '}
                {data.managerCount === 1 ? 'manager' : 'managers'}
              </span>
            </div>
            <h1 className="display m-0 text-[44px] tracking-[0.005em] sm:text-[66px]">
              {data.leagueName}
            </h1>
          </div>

          <div className="flex flex-col gap-2.5 sm:items-end sm:pb-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-[7px]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: data.status.settled
                      ? 'var(--pop)'
                      : data.status.provisional
                        ? 'var(--amber)'
                        : 'var(--dim)',
                  }}
                />
                <span className="font-mono text-[11px] tracking-[0.06em] text-ink">
                  {data.status.label}
                </span>
              </div>
              <ThemeToggle />
            </div>
            <div className="font-mono text-[11px] text-dim">{data.status.sub}</div>
          </div>
        </header>

        {/* ------------------------------------------------------ hero strip */}
        {data.hero ? (
          <Hero
            hero={[data.hero.week, data.hero.month, data.hero.season]}
            canShare={data.seasonStarted}
          />
        ) : null}

        <Leaderboard data={data} />

        {/* ---------------------------------------------------------- footer */}
        <footer className="mt-16 flex flex-col gap-2 border-t border-line pt-[22px] font-mono text-[11px] text-dim sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          {/* The design writes "settle on data_checked" here; that is the API's
              field name, not something the league should have to know. */}
          <span>Scores are final once FPL applies bonus points · checked {data.status.polled}</span>
          <span>
            {data.whatsappEnabled
              ? 'Table also posts to WhatsApp when a gameweek is final'
              : `${data.seasonLabel} · ${data.totalGameweeks} gameweeks`}
            {' · '}
            <a href={SOURCE_URL} target="_blank" rel="noreferrer noopener">
              source
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}
