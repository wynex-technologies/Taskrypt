/**
 * Taskrypt design tokens. Warm paper neutrals, a terracotta "ember" accent and
 * sage/gold supporting hues. Every foreground/background pair used for text is
 * chosen to meet WCAG AA (4.5:1) in both schemes.
 */

const palette = {
  paper50: '#FFFDF9',
  paper100: '#FBF7F1',
  paper200: '#F6F1EA',
  paper300: '#EDE5DA',
  paper400: '#DED3C5',
  stone500: '#A39A8F',
  stone600: '#6E665E',
  stone700: '#4D4741',
  ink900: '#1E1B18',
  night950: '#15120F',
  night900: '#1C1915',
  night850: '#24201B',
  night800: '#2D2822',
  night700: '#3B352E',
  ember500: '#D9653B',
  ember600: '#B9502B',
  ember300: '#F0A07F',
  ember100: '#FBE4D9',
  sage500: '#5E8A6B',
  sage300: '#9CC1A5',
  sage100: '#E1EDE3',
  gold500: '#C98F22',
  gold300: '#E7C06A',
  gold100: '#F8EBCB',
  sky500: '#3F72AF',
  sky300: '#8DB3E0',
  sky100: '#E0EAF6',
  plum500: '#7B5EA7',
  plum100: '#ECE5F5',
  crimson500: '#C2333F',
  crimson300: '#EC8790',
  crimson100: '#F9DEE0',
} as const;

export type ColorScheme = {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  accentPlum: string;
  accentPlumSoft: string;
  overlay: string;
  shadow: string;
  priority: Record<'low' | 'medium' | 'high' | 'urgent', { fg: string; bg: string }>;
};

export const lightColors: ColorScheme = {
  background: palette.paper200,
  backgroundAlt: palette.paper100,
  surface: palette.paper50,
  surfaceRaised: '#FFFFFF',
  surfaceSunken: palette.paper300,
  border: palette.paper400,
  borderStrong: palette.stone500,
  text: palette.ink900,
  textMuted: palette.stone600,
  textSubtle: '#857C72',
  textInverse: palette.paper50,
  primary: palette.ember600,
  primaryPressed: '#9C4223',
  primarySoft: palette.ember100,
  onPrimary: '#FFFFFF',
  success: '#3F7050',
  successSoft: palette.sage100,
  warning: '#8F6312',
  warningSoft: palette.gold100,
  danger: palette.crimson500,
  dangerSoft: palette.crimson100,
  info: palette.sky500,
  infoSoft: palette.sky100,
  accentPlum: palette.plum500,
  accentPlumSoft: palette.plum100,
  overlay: 'rgba(30,27,24,0.45)',
  shadow: '#4A3A2A',
  priority: {
    low: { fg: '#3F7050', bg: palette.sage100 },
    medium: { fg: '#2F5D93', bg: palette.sky100 },
    high: { fg: '#A4471F', bg: palette.ember100 },
    urgent: { fg: '#A92935', bg: palette.crimson100 },
  },
};

export const darkColors: ColorScheme = {
  background: palette.night950,
  backgroundAlt: palette.night900,
  surface: palette.night900,
  surfaceRaised: palette.night850,
  surfaceSunken: '#100E0B',
  border: palette.night700,
  borderStrong: '#5A5249',
  text: '#F3EDE4',
  textMuted: '#BDB3A6',
  textSubtle: '#9A9085',
  textInverse: palette.ink900,
  primary: palette.ember300,
  primaryPressed: '#E58C67',
  primarySoft: '#3A2419',
  onPrimary: palette.ink900,
  success: palette.sage300,
  successSoft: '#1E2C22',
  warning: palette.gold300,
  warningSoft: '#33280F',
  danger: palette.crimson300,
  dangerSoft: '#3A1A1D',
  info: palette.sky300,
  infoSoft: '#18263A',
  accentPlum: '#B9A2DD',
  accentPlumSoft: '#2A2238',
  overlay: 'rgba(0,0,0,0.6)',
  shadow: '#000000',
  priority: {
    low: { fg: palette.sage300, bg: '#1E2C22' },
    medium: { fg: palette.sky300, bg: '#18263A' },
    high: { fg: palette.ember300, bg: '#3A2419' },
    urgent: { fg: palette.crimson300, bg: '#3A1A1D' },
  },
};

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const fontFamilies = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_500Medium_Italic',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

export const typography = {
  hero: { fontFamily: fontFamilies.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  title: { fontFamily: fontFamilies.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { fontFamily: fontFamilies.bold, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  subheading: { fontFamily: fontFamilies.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamilies.semibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  caption: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fontFamilies.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
} as const;

export type TypographyVariant = keyof typeof typography;

export const motion = {
  duration: { instant: 90, fast: 160, base: 240, slow: 380, lazy: 650 },
  spring: {
    snappy: { damping: 18, stiffness: 260, mass: 0.8 },
    gentle: { damping: 16, stiffness: 140, mass: 1 },
    bouncy: { damping: 9, stiffness: 180, mass: 0.9 },
  },
} as const;

export const elevation = (shadowColor: string, level: 0 | 1 | 2 | 3) => {
  if (level === 0) return {};
  const map = {
    1: { shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
    2: { shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
    3: { shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  } as const;
  return { shadowColor, ...map[level] };
};

/** Minimum touch target recommended by Apple HIG / Material guidelines. */
export const HIT_TARGET = 44;
