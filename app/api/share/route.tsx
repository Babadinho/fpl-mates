import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { hasAccess } from '@/lib/auth';
import { toRasterSafeColor } from '@/lib/color';
import { getConfig } from '@/lib/config';
import { getShareCard, type ShareScope } from '@/lib/share';

/**
 * A winner as a 1080x1080 PNG, for pasting into the group chat.
 *
 * Rendered here rather than in the browser: the same ImageResponse path
 * already draws the link-preview card, so there is no canvas library to add
 * and no chance of a screenshot that renders differently per device.
 *
 * Fonts are read as TTF — Satori cannot parse the woff2 the site uses — and
 * colours go through toRasterSafeColor, since it cannot parse oklch either.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const SIZE = 1080;
const SCOPES: ShareScope[] = ['weekly', 'monthly', 'season'];

export async function GET(request: Request) {
  if (!(await hasAccess())) {
    return Response.json({ error: 'unauthorised' }, { status: 401 });
  }

  const scope = new URL(request.url).searchParams.get('scope') as ShareScope | null;
  if (!scope || !SCOPES.includes(scope)) {
    return Response.json({ error: 'scope must be weekly, monthly or season' }, { status: 400 });
  }

  const card = await getShareCard(scope);
  if (!card) {
    return Response.json({ error: 'nothing has settled yet' }, { status: 404 });
  }

  const cfg = getConfig();
  const accent = toRasterSafeColor(cfg.theme.light.accent);
  const pop = toRasterSafeColor(cfg.theme.light.pop);

  // One palette for all three. The season card was a green inversion, which
  // read as a different product rather than a bigger prize; a trophy marks it
  // instead.
  //
  // The surface is the app's own dark theme, put through the same converter as
  // the accent — Satori cannot read oklch, and hand-picked hex would drift from
  // the site the card came from.
  const bg = toRasterSafeColor('oklch(0.19 0.03 300)');
  const ink = toRasterSafeColor('oklch(0.96 0.01 300)');
  const dim = toRasterSafeColor('oklch(0.68 0.02 300)');
  const line = toRasterSafeColor('oklch(0.31 0.03 300)');
  const sub = toRasterSafeColor('oklch(0.6 0.02 300)');
  const figure = pop;

  // Only these two ship as TTF, which is all Satori reads. The card is
  // display type and figures anyway, so the body face is not missed.
  const [bebas, mono] = await Promise.all([
    readFile(join(process.cwd(), 'app/fonts/bebas-neue.ttf')),
    readFile(join(process.cwd(), 'app/fonts/jetbrains-mono.ttf')),
  ]);

  const label = (text: string) => (
    <div style={{ fontFamily: 'mono', fontSize: 20, letterSpacing: 4, color: dim, textTransform: 'uppercase' }}>
      {text}
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: bg,
          color: ink,
          padding: 84,
        }}
      >
        {/* Fixed height so the trophy does not make the season card's header
            taller than the other two and eat the space below. */}
        <div
          style={{
            display: 'flex',
            height: 44,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: accent }} />
            {label(card.league)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {label(card.season)}
            {card.isSeason && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke={figure}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                width="44"
                height="44"
              >
                <path d="M8 3h8v6a4 4 0 0 1-8 0V3z" />
                <path d="M8 4.5H5.5A2.5 2.5 0 0 0 8 9.5" />
                <path d="M16 4.5h2.5A2.5 2.5 0 0 1 16 9.5" />
                <line x1="12" y1="13" x2="12" y2="17" />
                <path d="M9 21h6" />
                <path d="M10 17h4l.6 4h-5.2z" />
              </svg>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 60 }}>
          <div style={{ fontFamily: 'mono', fontSize: 25, letterSpacing: 5, color: figure, textTransform: 'uppercase' }}>
            {card.title.toUpperCase()}
          </div>
          <div style={{ fontFamily: 'mono', fontSize: 23, letterSpacing: 2, color: sub }}>
            {card.eyebrow}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 36,
            paddingTop: 44,
            borderBottom: `1px solid ${line}`,
            paddingBottom: 32,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontFamily: 'display', fontSize: 124, lineHeight: 0.88 }}>
              {card.winner.toUpperCase()}
            </div>
            <div style={{ fontFamily: 'mono', fontSize: 24, color: dim }}>{card.team}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontFamily: 'mono', fontSize: 108, color: figure, lineHeight: 1 }}>
              {card.points}
            </div>
            {label(card.pointsLabel)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 52, paddingTop: 36 }}>
          {card.stats.map((s) => (
            <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {label(s.label)}
              <div style={{ fontFamily: 'mono', fontSize: 34, color: s.accent ? figure : ink }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', paddingTop: 30 }}>
          {label(card.chaseLabel)}
          <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 14 }}>
            {card.chase.map((c) => (
              <div
                key={c.rank}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 22,
                  padding: '18px 0',
                  borderTop: `1px solid ${line}`,
                }}
              >
                <div style={{ fontFamily: 'mono', fontSize: 22, color: dim, width: 44 }}>{c.rank}</div>
                <div style={{ fontFamily: 'mono', fontSize: 30, flex: 1 }}>{c.name}</div>
                <div style={{ fontFamily: 'mono', fontSize: 32 }}>{c.points}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: 'mono', fontSize: 18, color: dim, paddingTop: 26 }}>
            {card.footer}
          </div>
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      // The browser only receives a PNG and cannot know who won, so the name
      // is built here. Content-Disposition would not survive the fetch the
      // preview does, so it travels as its own header.
      headers: { 'x-share-filename': card.filename },
      fonts: [
        { name: 'display', data: bebas, style: 'normal', weight: 400 },
        { name: 'mono', data: mono, style: 'normal', weight: 500 },
      ],
    },
  );
}
