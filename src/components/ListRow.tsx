import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { HIT_TARGET, useTheme } from '@/theme';

import { AppText } from './AppText';
import { ScalePressable } from './Pressable';

type Props = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  chevron?: boolean;
  testID?: string;
};

export function ListRow({ title, subtitle, icon: Icon, iconColor, right, onPress, destructive, chevron = !!onPress, testID }: Props) {
  const { colors, spacing, radii } = useTheme();
  const fg = destructive ? colors.danger : colors.text;
  const content = (
    <>
      {Icon ? (
        <View style={[styles.icon, { backgroundColor: destructive ? colors.dangerSoft : colors.surfaceSunken, borderRadius: radii.sm }]}>
          <Icon size={18} color={iconColor ?? fg} strokeWidth={2.1} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" style={{ color: fg }} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={3}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight size={18} color={colors.textSubtle} /> : null}
    </>
  );
  const style = [styles.row, { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, gap: spacing.md }];
  if (!onPress)
    return (
      <View style={style} testID={testID}>
        {content}
      </View>
    );
  return (
    <ScalePressable testID={testID} onPress={onPress} pressedScale={0.99} accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} style={style}>
      {content}
    </ScalePressable>
  );
}

export function SwitchRow({ title, subtitle, icon, value, onValueChange, disabled, testID }: { title: string; subtitle?: string; icon?: LucideIcon; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; testID?: string }) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      testID={testID}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          accessibilityLabel={title}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.border}
        />
      }
    />
  );
}

/** Grouped rows on a card surface, iOS-settings style. */
export function RowGroup({ children, title }: { children: ReactNode; title?: string }) {
  const { colors, radii, spacing } = useTheme();
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={{ gap: spacing.sm }}>
      {title ? (
        <AppText variant="overline" color="textMuted" style={{ marginLeft: spacing.xs }}>
          {title}
        </AppText>
      ) : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>
        {items.map((child, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginLeft: spacing.lg } : null}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET + 12 },
  icon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
