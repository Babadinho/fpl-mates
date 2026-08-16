/**
 * The search field used by the table and the pre-season list.
 *
 * Full width on a phone, 250px from `sm` up, matching the design's toolbar.
 */
export function SearchBox({
  value,
  onChange,
  matches,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Rows left after filtering. Shown only once something is typed. */
  matches: number;
}) {
  return (
    <div className="flex w-full items-center gap-2 border-b border-dim bg-panel px-2.5 pt-[11px] pb-2.5 hover:border-accent focus-within:border-accent sm:w-[250px]">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
        className="block h-[13px] w-[13px] flex-none text-dim"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search manager or team"
        aria-label="Search manager or team"
        className="w-full min-w-0 appearance-none border-none bg-transparent p-0 font-mono text-[12.5px] text-ink outline-none"
      />

      {value.trim() !== '' && (
        <span className="flex-none font-mono text-[10px] tracking-[0.06em] text-dim">
          {matches} {matches === 1 ? 'match' : 'matches'}
        </span>
      )}
    </div>
  );
}
