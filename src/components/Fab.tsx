import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { ScalePressable } from './Pressable';

export function Fab({ icon: Icon, label, onPress, extended, bottomOffset = 0, testID }: { icon: LucideIcon; label: string; onPress: () => void; extended?: boolean; bottomOffset?: number; testID?: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScalePressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      pressedScale={0.92}
      style={[
        styles.fab,
        { backgroundColor: theme.colors.primary, bottom: 20 + bottomOffset + (bottomOffset ? 0 : insets.bottom), paddingHorizontal: extended ? 20 : 0, width: extended ? undefined : 60 },
        theme.shadow(3),
      ]}
    >
      <Icon size={24} color={theme.colors.onPrimary} strokeWidth={2.4} />
      {extended ? (
        <AppText variant="bodyStrong" style={{ color: theme.colors.onPrimary }}>
          {label}
        </AppText>
      ) : null}
    </ScalePressable>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', right: 20, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
});
