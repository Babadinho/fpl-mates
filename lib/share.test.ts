import { describe, expect, it } from 'vitest';
import { slug } from './share';

/**
 * Manager names come from FPL and are whatever people typed. The result goes
 * into an HTTP header, so anything outside plain ASCII would throw when the
 * response is built and take the whole card down.
 */
describe('slug', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slug('Tom Whitfield')).toBe('tom-whitfield');
  });

  it('drops apostrophes rather than leaving a stray dash', () => {
    expect(slug("Sean O'Reilly")).toBe('sean-o-reilly');
  });

  it('keeps the letter when stripping an accent', () => {
    expect(slug('José Muñoz')).toBe('jose-munoz');
    expect(slug('Zoë Ærø')).toBe('zoe-r');
  });

  it('never emits anything outside the safe set', () => {
    const nasty = ['A.B-C!', 'zσℓтαη x', 'αναπόφευκτη II', '🏆 NxtionMan', '   ', '💥💥'];
    for (const name of nasty) expect(slug(name)).toMatch(/^[a-z0-9-]*$/);
  });

  it('collapses runs and trims the ends', () => {
    expect(slug('  --Big   Banks--  ')).toBe('big-banks');
  });

  it('caps the length so a long name cannot run away', () => {
    expect(slug('a'.repeat(120)).length).toBe(40);
  });

  it('returns empty when nothing survives, so the caller can drop the part', () => {
    expect(slug('💥💥')).toBe('');
  });
});
