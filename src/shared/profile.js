/**
 * Profile-specific shared helpers.
 */

export const PROFILE_BIO_MAX_LINES = 2;
export const PROFILE_BIO_MAX_LENGTH = 120;

/** @type {readonly ['blush', 'sky', 'mint', 'coral', 'custom']} */
export const PROFILE_ACCENT_PALETTES = ['blush', 'sky', 'mint', 'coral', 'custom'];

/**
 * Normalizes a profile bio so it fits the compact profile card.
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function normalizeProfileBio(value) {
  const lines = String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, PROFILE_BIO_MAX_LINES);

  return lines.join('\n').slice(0, PROFILE_BIO_MAX_LENGTH);
}

/**
 * Coerces an accent palette key into a supported value.
 * @param {string | null | undefined} value
 * @returns {'blush' | 'sky' | 'mint' | 'coral' | 'custom'}
 */
export function normalizeAccentPaletteKey(value) {
  switch (value) {
    case 'custom':
    case 'sky':
    case 'mint':
    case 'coral':
    case 'blush':
      return value;
    default:
      return 'blush';
  }
}

/**
 * Normalizes a custom accent color into #RRGGBB form.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeCustomAccentHex(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^#0-9a-f]/gi, '');

  if (!normalized) return null;

  const raw = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  const expanded = raw.length === 3
    ? raw.split('').map(char => `${char}${char}`).join('')
    : raw;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) {
    return null;
  }

  return `#${expanded.toUpperCase()}`;
}
