import type { CharacterId } from '@/features/animation/characters';

import type { ColorScheme } from './tokens';

/**
 * Accent palettes. An accent recolours the brand hue (buttons, links, tab bar,
 * selection) and lightly tints the neutral surfaces; text and status colours
 * stay fixed. Every `light` primary passes 4.5:1 against white and the tinted
 * background; every `dark` primary passes 4.5:1 against ink and the dark
 * surfaces. Terracotta is the original look, so it overrides nothing.
 */

export const ACCENT_IDS = ['terracotta', 'sage', 'ocean', 'teal', 'lavender', 'rose', 'sunset'] as const;
export type AccentId = (typeof ACCENT_IDS)[number];

/** Each companion's matching palette, used when "Match my companion" is on. */
export const CHARACTER_ACCENT: Record<CharacterId, AccentId> = {
  kora: 'terracotta',
  mochi: 'lavender',
  bolt: 'ocean',
  pip: 'teal',
  ember: 'sunset',
};

type AccentDef = { label: string; light: string; dark: string };

export const ACCENTS: Record<AccentId, AccentDef> = {
  terracotta: { label: 'Terracotta', light: '#B9502B', dark: '#F0A07F' },
  sage: { label: 'Sage', light: '#3F7050', dark: '#A3C9AC' },
  ocean: { label: 'Ocean', light: '#2F6497', dark: '#8DB8E6' },
  teal: { label: 'Teal', light: '#1F6F6B', dark: '#7FCBC4' },
  lavender: { label: 'Lavender', light: '#5E5BA8', dark: '#B2B0EC' },
  rose: { label: 'Rose', light: '#B03E66', dark: '#F2A0BC' },
  sunset: { label: 'Sunset', light: '#A0520A', dark: '#F2B266' },
};

function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Applies an accent on top of a base scheme. */
export function applyAccent(base: ColorScheme, scheme: 'light' | 'dark', id: AccentId): ColorScheme {
  if (id === 'terracotta') return base;
  const { light, dark } = ACCENTS[id];
  if (scheme === 'light') {
    return {
      ...base,
      primary: light,
      primaryPressed: mix(light, '#000000', 0.16),
      primarySoft: mix('#FFFFFF', light, 0.14),
      background: mix('#F6F5F3', light, 0.06),
      backgroundAlt: mix('#FBFAF8', light, 0.035),
      surface: mix('#FFFFFF', light, 0.015),
      surfaceSunken: mix('#ECEAE6', light, 0.08),
      border: mix('#DDDAD5', light, 0.12),
    };
  }
  return {
    ...base,
    primary: dark,
    primaryPressed: mix(dark, '#000000', 0.1),
    primarySoft: mix('#161616', dark, 0.18),
    background: mix('#121212', dark, 0.04),
    backgroundAlt: mix('#181818', dark, 0.05),
    surface: mix('#181818', dark, 0.05),
    surfaceRaised: mix('#202020', dark, 0.06),
    surfaceSunken: mix('#0C0C0C', dark, 0.03),
    border: mix('#333333', dark, 0.1),
  };
}
