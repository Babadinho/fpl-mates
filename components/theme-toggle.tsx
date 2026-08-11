'use client';

import { useEffect, useState } from 'react';

/** Persists to `fpl-dark`; defaults to the system preference on first visit. */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  // The pre-paint script in layout.tsx already applied the theme; read back
  // from the DOM so this matches without a second flash.
  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    try {
      localStorage.setItem('fpl-dark', next ? '1' : '0');
    } catch {
      // Private browsing — the toggle still works for this page view.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle dark mode"
      aria-label="Toggle dark mode"
      className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border border-line bg-panel font-mono text-xs text-ink transition-colors hover:border-accent hover:text-accent"
    >
      {dark === null ? '' : dark ? '☀' : '☾'}
    </button>
  );
}
