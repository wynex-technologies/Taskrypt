import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  helper?: string;
  icon?: LucideIcon;
  secure?: boolean;
};

export const TextField = forwardRef<React.ComponentRef<typeof TextInput>, Props>(function TextField({ label, error, helper, icon: Icon, secure, style, multiline, ...rest }, ref) {
  const { colors, radii, typography, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.box,
          {
            borderColor,
            borderRadius: radii.md,
            backgroundColor: colors.surfaceRaised,
            minHeight: multiline ? 96 : 50,
            alignItems: multiline ? 'flex-start' : 'center',
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}
      >
        {Icon ? <Icon size={18} color={colors.textMuted} style={{ marginTop: multiline ? 14 : 0 }} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={secure && hidden}
          multiline={multiline}
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityHint={error ?? helper}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          maxFontSizeMultiplier={1.5}
          // Single-line: symmetric padding and no lineHeight, which otherwise pushes the caret/text off-centre (iOS) while typing.
          style={[typography.body, styles.input, multiline ? styles.multiline : styles.singleLine, { color: colors.text }, style]}
          {...rest}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={12}
            style={styles.eye}
          >
            {hidden ? <Eye size={19} color={colors.textMuted} /> : <EyeOff size={19} color={colors.textMuted} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" color="textSubtle">
          {helper}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { flexDirection: 'row', paddingHorizontal: 14, gap: 10 },
  input: { flex: 1, minHeight: 48, includeFontPadding: false },
  singleLine: { lineHeight: undefined, paddingVertical: 0, textAlignVertical: 'center' },
  multiline: { paddingTop: 12, paddingBottom: 10, textAlignVertical: 'top' },
  eye: { padding: 4 },
});
