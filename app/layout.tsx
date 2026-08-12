import type { Metadata } from 'next';
import { Bebas_Neue, JetBrains_Mono, Manrope } from 'next/font/google';
import { getConfig } from '@/lib/config';
import { getLeaderboardView } from '@/lib/view';
import './globals.css';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const manrope = Manrope({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-manrope' });
const jetbrains = JetBrains_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-jetbrains' });

export async function generateMetadata(): Promise<Metadata> {
  // Falls back to the league name stored by the poller, so the tab title is
  // right without anyone setting LEAGUE_DISPLAY_NAME.
  const { leagueName, seasonLabel } = await getLeaderboardView();
  return {
    title: `${leagueName} · ${seasonLabel}`,
    description: 'Weekly, monthly and season tables for a Fantasy Premier League mini-league.',
    icons: {
      // Two rasterised variants rather than one themed SVG: the mark is set in
      // Bebas Neue, and a standalone SVG cannot reach the page's webfont — it
      // falls back to Impact and the G comes out wrong. These PNGs were
      // rendered with the real face.
      //
      // The browser picks by prefers-color-scheme, which follows the OS theme,
      // not the in-page toggle — the icon lives in the browser chrome.
      icon: [
        { url: '/icon-512.png', type: 'image/png', media: '(prefers-color-scheme: light)' },
        { url: '/icon-512-dark.png', type: 'image/png', media: '(prefers-color-scheme: dark)' },
      ],
      apple: { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    },
  };
}

/**
 * Applies the stored theme before first paint. Without this the page renders
 * light, then flips — the 200ms token transition makes that very visible.
 */
const THEME_SCRIPT = `
try {
  var stored = localStorage.getItem('fpl-dark');
  var dark = stored === null
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : stored === '1';
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { theme } = getConfig();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      style={
        {
          '--accent-light': theme.light.accent,
          '--pop-light': theme.light.pop,
          '--accent-dark': theme.dark.accent,
          '--pop-dark': theme.dark.pop,
        } as React.CSSProperties
      }
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${bebas.variable} ${manrope.variable} ${jetbrains.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
