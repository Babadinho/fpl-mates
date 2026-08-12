import { describe, expect, it } from 'vitest';
import { oklchToHex, toRasterSafeColor } from './color';

describe('oklchToHex', () => {
  // The three sRGB primaries have well-known oklch coordinates, so these pin
  // the conversion to something checkable rather than to eyeballed brand hexes.
  it('converts the sRGB primaries exactly', () => {
    expect(oklchToHex(0.62796, 0.25768, 29.234)).toBe('#ff0000');
    expect(oklchToHex(0.86644, 0.294827, 142.4953)).toBe('#00ff00');
    expect(oklchToHex(0.45201, 0.31321, 264.052)).toBe('#0000ff');
  });

  it('converts the achromatic extremes', () => {
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
    expect(oklchToHex(1, 0, 0)).toBe('#ffffff');
  });

  it('clips out-of-gamut colours to a valid hex rather than producing garbage', () => {
    expect(oklchToHex(0.7, 0.4, 145)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('converts the default theme tokens', () => {
    expect(oklchToHex(0.42, 0.17, 305)).toBe('#632895');
    expect(oklchToHex(0.72, 0.19, 145)).toBe('#43c251');
  });
});

describe('toRasterSafeColor', () => {
  it('converts oklch', () => {
    expect(toRasterSafeColor('oklch(0.42 0.17 305)')).toBe('#632895');
  });

  it('accepts a percentage lightness', () => {
    expect(toRasterSafeColor('oklch(42% 0.17 305)')).toBe('#632895');
  });

  it('tolerates a deg suffix on the hue', () => {
    expect(toRasterSafeColor('oklch(0.42 0.17 305deg)')).toBe('#632895');
  });

  it('passes hex through untouched — Satori already accepts it', () => {
    expect(toRasterSafeColor('#3ddc84')).toBe('#3ddc84');
  });

  it('passes rgb and named colours through untouched', () => {
    expect(toRasterSafeColor('rgb(61 220 132)')).toBe('rgb(61 220 132)');
    expect(toRasterSafeColor('rebeccapurple')).toBe('rebeccapurple');
  });

  it('trims surrounding whitespace', () => {
    expect(toRasterSafeColor('  #3ddc84  ')).toBe('#3ddc84');
  });
});
