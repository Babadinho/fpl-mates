'use client';

import { useActionState } from 'react';
import { submitPasscode, type GateState } from '@/app/actions';

export function Gate({
  leagueName,
  eyebrow,
  rememberedFor,
}: {
  leagueName: string;
  eyebrow: string;
  /** Generated from PASSCODE_REMEMBER_DAYS, so the promise matches the cookie. */
  rememberedFor: string;
}) {
  const [state, action, pending] = useActionState<GateState, FormData>(submitPasscode, {});

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <form action={action} className="flex w-full max-w-[360px] flex-col gap-[26px]">
        <div className="flex items-center gap-2.5">
          <span className="block h-[22px] w-[22px] rounded-[4px] bg-accent" />
          <span className="font-mono text-[11px] tracking-[0.18em] text-dim uppercase">
            {eyebrow}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <h1 className="display m-0 text-[52px] tracking-[0.005em]">{leagueName}</h1>
          <p className="m-0 text-[15px] leading-[1.6] text-dim">
            This league table is private. Enter the passcode your league shares.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <input
            type="password"
            name="passcode"
            placeholder="Passcode"
            autoFocus
            autoComplete="current-password"
            aria-label="Passcode"
            aria-invalid={Boolean(state.error)}
            className={`w-full rounded-[4px] border bg-panel px-4 py-3.5 font-mono text-[14px] tracking-[0.2em] text-ink outline-none ${
              state.error ? 'border-danger' : 'border-line focus:border-accent'
            }`}
          />
          {state.error && <span className="font-mono text-[11px] text-danger">{state.error}</span>}

          <button
            type="submit"
            disabled={pending}
            className="w-full cursor-pointer rounded-[4px] border border-accent bg-accent px-4 py-3.5 font-sans text-[13px] font-semibold tracking-[0.1em] text-accent-ink uppercase disabled:opacity-60"
          >
            {pending ? 'Checking' : 'Enter'}
          </button>
        </div>

        <span className="font-mono text-[11px] leading-[1.7] text-dim">
          One passcode for the whole league. It is remembered on this device for{' '}
          {rememberedFor}.
        </span>
      </form>
    </div>
  );
}
