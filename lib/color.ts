/**
 * Colour conversion for the raster icon path.
 *
 * The theme is authored in oklch — better perceptual uniformity, and it is
 * what the design tokens in section 10 specify. But Satori, which rasterises
 * the Apple touch icon, only understands hex/rgb/named colours and throws on
 * `oklch(...)`. So raster output converts; CSS keeps the original.
 */

/** sRGB gamma transfer function. */
function encodeGamma(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const toByte = (n: number) => Math.round(clamp01(n) * 255);
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

/**
 * oklch(L C H) → #rrggbb.
 *
 * L is 0–1 (or a percentage), C is chroma, H is degrees. Out-of-gamut colours
 * are clipped per channel, which is what browsers do for simple cases too.
 */
export function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  // OKLab → LMS (cube roots)
  const lCbrt = l + 0.3963377774 * a + 0.2158037573 * b;
  const mCbrt = l - 0.1055613458 * a - 0.0638541728 * b;
  const sCbrt = l - 0.0894841775 * a - 1.291485548 * b;

  const lms = [lCbrt ** 3, mCbrt ** 3, sCbrt ** 3] as const;

  // LMS → linear sRGB
  const r = 4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2];
  const g = -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2];
  const bl = -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2];

  return `#${hex2(toByte(encodeGamma(r)))}${hex2(toByte(encodeGamma(g)))}${hex2(toByte(encodeGamma(bl)))}`;
}

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i;

/**
 * Converts a CSS colour to a form Satori accepts.
 *
 * oklch is converted; everything else (hex, rgb, named) passes through
 * untouched, since those already work.
 */
export function toRasterSafeColor(css: string): string {
  const match = css.trim().match(OKLCH);
  if (!match) return css.trim();

  const rawL = match[1];
  const l = rawL.endsWith('%') ? parseFloat(rawL) / 100 : parseFloat(rawL);
  return oklchToHex(l, parseFloat(match[2]), parseFloat(match[3]));
}
