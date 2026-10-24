import type { LucideIcon } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { HIT_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { ScalePressable } from './Pressable';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  color?: string;
  count?: number;
  testID?: string;
  accessibilityLabel?: string;
};

export function Chip({ label, selected, onPress, icon: Icon, color, count, testID, accessibilityLabel }: ChipProps) {
  const { colors, radii } = useTheme();
  const fg = selected ? colors.onPrimary : colors.text;
  return (
    <ScalePressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? (count !== undefined ? `${label}, ${count}` : label)}
      hitSlop={6}
      style={[
        styles.chip,
        {
          borderRadius: radii.pill,
          backgroundColor: selected ? colors.primary : colors.surfaceRaised,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      {Icon ? <Icon size={15} color={fg} /> : null}
      <AppText variant="label" style={{ color: fg }} numberOfLines={1}>
        {label}
      </AppText>
      {count !== undefined ? (
        <AppText variant="caption" style={{ color: selected ? colors.onPrimary : colors.textMuted }}>
          {count}
        </AppText>
      ) : null}
    </ScalePressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={{ flexGrow: 0 }}>
      {children}
    </ScrollView>
  );
}

export function Pill({ label, fg, bg, icon: Icon }: { label: string; fg: string; bg: string; icon?: LucideIcon }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {Icon ? <Icon size={12} color={fg} strokeWidth={2.4} /> : null}
      <AppText variant="caption" style={{ color: fg }} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: HIT_TARGET - 8, paddingHorizontal: 14, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { gap: 8, paddingVertical: 2, paddingRight: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
});
