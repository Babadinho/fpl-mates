import { ImageResponse } from 'next/og';
import { toRasterSafeColor } from '@/lib/color';
import { getConfig } from '@/lib/config';

/**
 * iOS home-screen icon. Generated rather than checked in for the same reason
 * as the SVG: the colours come from config. Apple will not take an SVG, so
 * this rasterises the same mark.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  const { theme } = getConfig();
  // Satori cannot parse oklch(), which is what the theme is authored in.
  const plate = toRasterSafeColor(theme.light.accent);
  const dot = toRasterSafeColor(theme.light.pop);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          background: plate,
          // iOS applies its own mask, so the artwork stays square.
          padding: 26,
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: dot,
          }}
        />
      </div>
    ),
    size,
  );
}
