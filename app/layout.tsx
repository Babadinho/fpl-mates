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
    // Generated from ACCENT_COLOR / POP_COLOR so a self-hosted instance gets an
    // icon in its own theme (section 11). The SVG carries both schemes itself;
    // apple-icon.tsx rasterises the same mark, since iOS will not take an SVG.
    icons: {
      icon: [{ url: '/api/icon.svg', type: 'image/svg+xml' }],
      // Declared explicitly: setting `icons` overrides Next's file conventions,
      // so app/apple-icon.tsx would otherwise generate but never be linked.
      apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
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
