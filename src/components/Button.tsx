import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { HIT_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { ScalePressable } from './Pressable';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'lg' | 'sm';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({ label, onPress, variant = 'primary', size = 'md', icon: Icon, loading, disabled, fullWidth, style, accessibilityHint, testID }: Props) {
  const { colors, radii, spacing } = useTheme();
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surfaceRaised, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.danger, fg: '#FFFFFF', border: colors.danger },
    soft: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
  }[variant];
  const height = size === 'lg' ? 56 : size === 'sm' ? 38 : 48;
  const inactive = disabled || loading;

  return (
    <ScalePressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      disabled={!!inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      hitSlop={height < HIT_TARGET ? (HIT_TARGET - height) / 2 : undefined}
      style={[
        styles.base,
        {
          minHeight: height,
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.xl,
          borderRadius: radii.md,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={size === 'sm' ? 16 : 19} color={palette.fg} strokeWidth={2.2} /> : null}
          <AppText variant={size === 'sm' ? 'label' : 'bodyStrong'} style={{ color: palette.fg }} numberOfLines={1}>
            {label}
          </AppText>
        </View>
      )}
    </ScalePressable>
  );
}

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  tone?: 'default' | 'primary' | 'danger';
  filled?: boolean;
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function IconButton({ icon: Icon, label, onPress, tone = 'default', filled, size = 22, disabled, style, testID }: IconButtonProps) {
  const { colors } = useTheme();
  const fg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.text;
  return (
    <ScalePressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={!!disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      pressedScale={0.9}
      style={[
        styles.icon,
        { backgroundColor: filled ? colors.surfaceRaised : 'transparent', borderColor: filled ? colors.border : 'transparent', opacity: disabled ? 0.4 : 1 },
        style,
      ]}
    >
      <Icon size={size} color={fg} strokeWidth={2} />
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: HIT_TARGET, height: HIT_TARGET, borderRadius: HIT_TARGET / 2, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
