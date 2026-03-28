import { describe, it, expect } from './runner.js';
import { normalizeAccentPaletteKey, normalizeCustomAccentHex, normalizeProfileBio } from '../src/shared/profile.js';

describe('Profile state helpers', () => {
  it('limits profile bio to two lines', () => {
    const bio = normalizeProfileBio('First line\nSecond line\nThird line');
    expect(bio).toBe('First line\nSecond line');
  });

  it('trims bio line whitespace before storing', () => {
    const bio = normalizeProfileBio('  First line  \n   Second line   ');
    expect(bio).toBe('First line\nSecond line');
  });

  it('drops empty bio lines while preserving order', () => {
    const bio = normalizeProfileBio('\n  First line\n\nSecond line\n');
    expect(bio).toBe('First line\nSecond line');
  });

  it('falls back to blush for unsupported accent palette values', () => {
    expect(normalizeAccentPaletteKey('violet')).toBe('blush');
  });

  it('keeps supported accent palette values unchanged', () => {
    expect(normalizeAccentPaletteKey('mint')).toBe('mint');
  });

  it('supports the custom accent palette key', () => {
    expect(normalizeAccentPaletteKey('custom')).toBe('custom');
  });

  it('normalizes valid custom accent hex values', () => {
    expect(normalizeCustomAccentHex('7be4d7')).toBe('#7BE4D7');
    expect(normalizeCustomAccentHex('#f8a')).toBe('#FF88AA');
  });

  it('rejects malformed custom accent hex values', () => {
    expect(normalizeCustomAccentHex('hello')).toBeNull();
  });
});
