/**
 * Streamed immediately while the page renders on the server.
 *
 * The page is force-dynamic and, during a gameweek, waits on FPL for
 * fixtures and live scores before it can send anything — so without this the
 * browser holds a blank screen for the whole round trip. Next sends this shell
 * first and swaps in the real page when it is ready.
 *
 * It cannot know whether the season has started, so it shows only what is true
 * in both states: the header, the tabs, and a list. Structure that carries no
 * data — the logo, the rules, the spacing — is drawn for real, so the swap
 * moves as little as possible.
 */
const GRID =
  'grid grid-cols-[44px_minmax(0,1fr)_72px_88px] sm:grid-cols-[44px_minmax(0,1fr)_96px_96px_104px]';

function Bar({ className, style }: { className: string; style?: React.CSSProperties }) {
  return <div className={`fpl-skeleton ${className}`} style={style} />;
}

export default function Loading() {
  return (
    <div className="min-h-screen px-5 pb-24 sm:px-8" aria-busy="true" aria-label="Loading the league">
      <div className="mx-auto max-w-[1060px]">
        <header className="flex flex-col gap-6 border-b border-line pt-7 pb-[34px] sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:pt-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              {/* Not data, so it is drawn rather than suggested. */}
              <span className="block h-[22px] w-[22px] rounded-[4px] bg-accent" />
              <Bar className="h-[11px] w-[180px] bg-line" />
            </div>
            <Bar className="h-[44px] w-[260px] bg-line sm:h-[66px] sm:w-[420px]" />
          </div>

          <div className="flex flex-col gap-2.5 sm:items-end sm:pb-1.5">
            <div className="flex items-center gap-2.5">
              <Bar className="h-[31px] w-[132px] rounded-full bg-line" />
              <Bar className="h-[34px] w-[34px] rounded-full bg-line" />
            </div>
            <Bar className="h-[11px] w-[150px] bg-hair" />
          </div>
        </header>

        <nav className="flex gap-1.5 pt-5 pb-1">
          {/* Widths track the real labels — Weekly, Monthly, Season, History. */}
          {[62, 70, 64, 66].map((width) => (
            <Bar key={width} className="h-[31px] rounded-[4px] bg-line" style={{ width }} />
          ))}
        </nav>

        <section className="pt-[26px]">
          <div className="flex flex-col gap-[7px] pb-[18px]">
            <Bar className="h-[32px] w-[220px] bg-line" />
            <Bar className="h-[11px] w-[160px] bg-hair" />
          </div>

          <div className={`${GRID} border-b border-line px-3.5 pb-2.5`}>
            <Bar className="h-2 w-4 bg-hair" />
            <Bar className="h-2 w-16 bg-hair" />
            <Bar className="h-2 w-10 justify-self-end bg-hair" />
            <Bar className="h-2 w-8 justify-self-end bg-hair" />
            <Bar className="hidden h-2 w-10 justify-self-end bg-hair sm:block" />
          </div>

          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`${GRID} items-center border-b border-hair px-3.5 py-[15px]`}>
              <Bar className="h-[13px] w-5 bg-hair" />
              <div className="flex flex-col gap-[5px]">
                <Bar className="h-[15px] w-[45%] bg-line" />
                <Bar className="h-[11px] w-[30%] bg-hair" />
              </div>
              <Bar className="h-[15px] w-8 justify-self-end bg-line" />
              <Bar className="h-[13px] w-6 justify-self-end bg-hair" />
              <Bar className="hidden h-[13px] w-8 justify-self-end bg-hair sm:block" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
