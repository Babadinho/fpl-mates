import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { toRasterSafeColor } from '@/lib/color';
import { getConfig } from '@/lib/config';
import { getLeaderboardView } from '@/lib/view';

/**
 * The link-preview card, generated from the same config as everything else so
 * a self-hosted instance shares its own league and its own colours.
 *
 * Fonts are read from disk as TTF: Satori cannot parse woff2, which is what
 * the site itself uses.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'League leaderboard';

export default async function OpengraphImage() {
  const cfg = getConfig();
  const { leagueName, seasonLabel, season, history } = await getLeaderboardView();

  // A league of one is nobody's idea of a boast, and zero reads as broken.
  const managers = season.rows.length;
  const subtitle =
    managers > 1 ? `${seasonLabel} · ${managers} managers` : seasonLabel;

  // history.weekly is built from settled gameweeks and newest first, so this is
  // never a provisional winner. Absent before the season, which is why the
  // right-hand block has to be optional rather than a fixed slot.
  const latest = history.weekly[0];

  const plate = toRasterSafeColor(cfg.theme.light.accent);
  const dot = toRasterSafeColor(cfg.theme.light.pop);

  const [bebas, mono] = await Promise.all([
    readFile(join(process.cwd(), 'app/fonts/bebas-neue.ttf')),
    readFile(join(process.cwd(), 'app/fonts/jetbrains-mono.ttf')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: plate,
          color: '#f7f5fa',
          padding: 80,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: dot }} />
          <div style={{ fontFamily: 'mono', fontSize: 26, letterSpacing: 6, opacity: 0.85 }}>
            {cfg.site.eyebrow.toUpperCase()}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 60 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'display', fontSize: 150, lineHeight: 1 }}>
              {leagueName.toUpperCase()}
            </div>
            <div style={{ fontFamily: 'mono', fontSize: 30, letterSpacing: 4, opacity: 0.85, marginTop: 18 }}>
              {subtitle}
            </div>
          </div>

          {latest ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                flexShrink: 0,
                paddingBottom: 6,
              }}
            >
              <div style={{ fontFamily: 'mono', fontSize: 22, letterSpacing: 5, opacity: 0.7 }}>
                {`${latest.gw.replace(/\s+/g, ' ')} WINNER`}
              </div>
              {/* Wraps rather than truncates: the block is bottom-aligned, so a
                  long name grows upward into empty space instead of colliding
                  with the league name. */}
              <div
                style={{
                  fontFamily: 'display',
                  fontSize: 76,
                  lineHeight: 1.05,
                  marginTop: 10,
                  maxWidth: 430,
                  textAlign: 'right',
                }}
              >
                {latest.name.toUpperCase()}
              </div>
              <div style={{ fontFamily: 'mono', fontSize: 30, color: dot, marginTop: 10 }}>
                {`${latest.pts} pts`}
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ fontFamily: 'mono', fontSize: 26, opacity: 0.75 }}>
          Weekly · Monthly · Season · Winners
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'display', data: bebas, style: 'normal', weight: 400 },
        { name: 'mono', data: mono, style: 'normal', weight: 500 },
      ],
    },
  );
}
