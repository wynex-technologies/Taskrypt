import { StyleSheet, View } from 'react-native';

import { HIT_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { ScalePressable } from './Pressable';

type Option<T extends string | number> = { value: T; label: string };

export function Segmented<T extends string | number>({ options, value, onChange, accessibilityLabel }: { options: Option<T>[]; value: T; onChange: (v: T) => void; accessibilityLabel?: string }) {
  const { colors, radii } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={[styles.wrap, { backgroundColor: colors.surfaceSunken, borderRadius: radii.md }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <ScalePressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={[styles.item, { borderRadius: radii.sm, backgroundColor: selected ? colors.surfaceRaised : 'transparent' }, selected ? styles.shadow : null]}
          >
            <AppText variant="label" style={{ color: selected ? colors.text : colors.textMuted }} numberOfLines={1}>
              {o.label}
            </AppText>
          </ScalePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 4, gap: 4 },
  item: { flex: 1, minHeight: HIT_TARGET - 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  shadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
});
