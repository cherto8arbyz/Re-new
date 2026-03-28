import type { AccentPaletteKey, ThemeMode } from '../types/models';

export interface ThemeTokens {
  mode: ThemeMode;
  accentPalette: AccentPaletteKey;
  colors: {
    background: string;
    backgroundSecondary: string;
    surface: string;
    surfaceElevated: string;
    panel: string;
    panelStrong: string;
    card: string;
    text: string;
    textSecondary: string;
    muted: string;
    accent: string;
    accentMuted: string;
    accentSoft: string;
    accentPressed: string;
    accentContrast: string;
    border: string;
    borderStrong: string;
    success: string;
    danger: string;
    shadow: string;
    overlay: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
}

export interface AccentPaletteOption {
  key: AccentPaletteKey;
  label: string;
  color: string;
}

const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

const CUSTOM_ACCENT_FALLBACK = '#FF88E7';

const ACCENT_PALETTES: AccentPaletteOption[] = [
  { key: 'blush', label: 'Blush', color: '#FF88E7' },
  { key: 'sky', label: 'Sky', color: '#78B7FF' },
  { key: 'mint', label: 'Mint', color: '#73E1BF' },
  { key: 'coral', label: 'Coral', color: '#FF9A7D' },
];

const DARK_BASE = {
  background: '#0d1017',
  backgroundSecondary: '#111722',
  surface: '#171d29',
  surfaceElevated: '#202837',
  panel: '#242d3d',
  panelStrong: '#2a3447',
  card: '#1b2331',
  text: '#f5efe7',
  textSecondary: '#d8d0c5',
  muted: '#8f98ab',
  border: '#2d3648',
  borderStrong: '#45516a',
  success: '#6ccf95',
  danger: '#ff6b6b',
  shadow: '#05070b',
  overlay: 'rgba(5, 7, 11, 0.72)',
} as const;

const LIGHT_BASE = {
  background: '#f6f2f7',
  backgroundSecondary: '#efe8f2',
  surface: '#fffafc',
  surfaceElevated: '#ffffff',
  panel: '#f0e4eb',
  panelStrong: '#e3cdda',
  card: '#fff6fb',
  text: '#24171f',
  textSecondary: '#4a3944',
  muted: '#816b78',
  border: '#dfd0d9',
  borderStrong: '#caaebf',
  success: '#2f8f58',
  danger: '#b63838',
  shadow: '#91787f',
  overlay: 'rgba(36, 23, 31, 0.18)',
} as const;

export const ACCENT_PALETTE_OPTIONS = ACCENT_PALETTES;

export function resolveTheme(
  mode: ThemeMode,
  accentPalette: AccentPaletteKey = 'blush',
  customAccentColor: string | null = null,
): ThemeTokens {
  const preset = ACCENT_PALETTES.find(option => option.key === accentPalette) || ACCENT_PALETTES[0];
  const surfaceBase = mode === 'light' ? LIGHT_BASE : DARK_BASE;
  const accent = accentPalette === 'custom' && isHexColor(customAccentColor)
    ? customAccentColor
    : accentPalette === 'custom'
      ? CUSTOM_ACCENT_FALLBACK
      : preset.color;

  return {
    mode,
    accentPalette,
    colors: {
      ...surfaceBase,
      accent,
      accentMuted: mode === 'light'
        ? mixHex(accent, '#ffffff', 0.78)
        : mixHex(accent, surfaceBase.background, 0.22),
      accentSoft: mode === 'light'
        ? mixHex(accent, '#ffffff', 0.9)
        : withOpacity(accent, 0.16),
      accentPressed: mode === 'light'
        ? mixHex(accent, '#000000', 0.12)
        : mixHex(accent, '#000000', 0.18),
      accentContrast: getContrastText(accent),
    },
    spacing,
    radius,
  };
}

export const defaultTheme = resolveTheme('dark', 'blush', null);
export const theme = defaultTheme;

function isHexColor(value: string | null): value is string {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function getContrastText(hex: string): string {
  const { red, green, blue } = parseHex(hex);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.64 ? '#1f1320' : '#ffffff';
}

function mixHex(hex: string, mixWith: string, weight: number): string {
  const base = parseHex(hex);
  const target = parseHex(mixWith);
  const ratio = Math.max(0, Math.min(1, weight));
  const red = Math.round(base.red * (1 - ratio) + target.red * ratio);
  const green = Math.round(base.green * (1 - ratio) + target.green * ratio);
  const blue = Math.round(base.blue * (1 - ratio) + target.blue * ratio);
  return toHex({ red, green, blue });
}

function withOpacity(hex: string, opacity: number): string {
  const { red, green, blue } = parseHex(hex);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

function parseHex(hex: string): { red: number; green: number; blue: number } {
  const normalized = String(hex || '').trim().replace('#', '');
  const safe = normalized.length === 3
    ? normalized.split('').map(char => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);

  return {
    red: Number.parseInt(safe.slice(0, 2), 16) || 0,
    green: Number.parseInt(safe.slice(2, 4), 16) || 0,
    blue: Number.parseInt(safe.slice(4, 6), 16) || 0,
  };
}

function toHex(rgb: { red: number; green: number; blue: number }): string {
  return `#${rgb.red.toString(16).padStart(2, '0')}${rgb.green.toString(16).padStart(2, '0')}${rgb.blue.toString(16).padStart(2, '0')}`;
}
