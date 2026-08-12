import { getConfig } from '@/lib/config';

/**
 * The app icon, generated from the configured theme.
 *
 * It is a route rather than a static file because ACCENT_COLOR and POP_COLOR
 * are environment variables (section 11) — a group self-hosting with their own
 * colours gets a matching icon without editing any asset.
 *
 * Pure geometry, no text: a letterform would need a webfont, and a standalone
 * SVG cannot reach one, which is what broke the previous icon.
 *
 * The mark mirrors the page header — the accent square, and the pop-coloured
 * dot the tables use to mark the leader.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const { theme } = getConfig();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <style>
    /* Follows the browser chrome, which uses the OS theme — not the in-page
       toggle, since the icon is painted alongside the tab bar. */
    :root { --plate: ${theme.light.accent}; --dot: ${theme.light.pop}; }
    @media (prefers-color-scheme: dark) {
      :root { --plate: ${theme.dark.accent}; --dot: ${theme.dark.pop}; }
    }
  </style>
  <rect width="512" height="512" rx="104" fill="var(--plate)"/>
  <circle cx="368" cy="368" r="72" fill="var(--dot)"/>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      // Fixed for the life of a deployment; env changes ship a new one.
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    },
  });
}
