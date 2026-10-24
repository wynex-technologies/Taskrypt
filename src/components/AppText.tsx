import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme, type TypographyVariant } from '@/theme';
import type { ColorScheme } from '@/theme/tokens';

type ColorKey = { [K in keyof ColorScheme]: ColorScheme[K] extends string ? K : never }[keyof ColorScheme];

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: ColorKey;
  align?: TextStyle['textAlign'];
};

/** Theme-aware text. Respects the OS font scale, capped so layouts stay intact. */
export function AppText({ variant = 'body', color = 'text', align, style, maxFontSizeMultiplier = 1.6, ...rest }: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[theme.typography[variant], { color: theme.colors[color] }, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
