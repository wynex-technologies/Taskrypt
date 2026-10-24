import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { usePreferencesStore } from '@/stores/preferencesStore';

import { applyAccent, CHARACTER_ACCENT, type AccentId } from './accents';
import { darkColors,elevation, lightColors, motion, radii, spacing, typography, type ColorScheme } from './tokens';

export type Theme = {
  scheme: 'light' | 'dark';
  accent: AccentId;
  colors: ColorScheme;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  motion: typeof motion;
  reduceMotion: boolean;
  shadow: (level: 0 | 1 | 2 | 3) => ReturnType<typeof elevation>;
};

const ThemeContext = createContext<Theme | null>(null);

export function buildTheme(scheme: 'light' | 'dark', reduceMotion: boolean, accent: AccentId = 'terracotta'): Theme {
  const colors = applyAccent(scheme === 'dark' ? darkColors : lightColors, scheme, accent);
  return {
    scheme,
    accent,
    colors,
    spacing,
    radii,
    typography,
    motion,
    reduceMotion,
    shadow: (level) => elevation(colors.shadow, level),
  };
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const preference = usePreferencesStore((s) => s.themePreference);
  const motionPreference = usePreferencesStore((s) => s.motionPreference);
  const accentPreference = usePreferencesStore((s) => s.accentPreference);
  const character = usePreferencesStore((s) => s.mascotCharacter);
  const systemReducedMotion = useReducedMotion();

  const scheme: 'light' | 'dark' = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const reduceMotion = motionPreference === 'reduced' || (motionPreference === 'system' && systemReducedMotion);
  const accent = accentPreference === 'companion' ? (CHARACTER_ACCENT[character] ?? 'terracotta') : accentPreference;

  const theme = useMemo(() => buildTheme(scheme, reduceMotion, accent), [scheme, reduceMotion, accent]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
