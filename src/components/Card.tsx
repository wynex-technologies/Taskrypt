import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { ScalePressable } from './Pressable';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'surface' | 'raised' | 'sunken' | 'primary';
  elevated?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function Card({ children, onPress, onLongPress, style, tone = 'surface', elevated = false, accessibilityLabel, accessibilityHint, testID }: Props) {
  const theme = useTheme();
  const bg = {
    surface: theme.colors.surface,
    raised: theme.colors.surfaceRaised,
    sunken: theme.colors.surfaceSunken,
    primary: theme.colors.primarySoft,
  }[tone];
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: bg, borderRadius: theme.radii.lg, borderColor: theme.colors.border, padding: theme.spacing.lg },
    elevated ? theme.shadow(2) : null,
    style,
  ];
  if (!onPress && !onLongPress)
    return (
      <View style={base} testID={testID} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  return (
    <ScalePressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      pressedScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={base}
    >
      {children}
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
});
