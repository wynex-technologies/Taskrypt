import { CloudOff, RefreshCw } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Mascot } from '@/features/animation/Mascot';
import type { MascotMood } from '@/features/animation/mascotStore';
import { userMessageOf } from '@/lib/errors';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';

type EmptyProps = {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  mood?: MascotMood;
  compact?: boolean;
};

export function EmptyState({ title, body, actionLabel, onAction, mood = 'empty', compact }: EmptyProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.center, { paddingVertical: compact ? spacing.xl : spacing.huge, gap: spacing.md }]}>
      <Mascot size={compact ? 84 : 120} mood={mood} />
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText color="textMuted" align="center" style={{ maxWidth: 320 }}>
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={{ marginTop: spacing.sm }} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, title = 'That did not load' }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.center, { paddingVertical: spacing.xxxl, gap: spacing.md }]} accessibilityLiveRegion="polite">
      <Mascot size={96} mood="error" />
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText color="textMuted" align="center" style={{ maxWidth: 320 }}>
        {userMessageOf(error)}
      </AppText>
      {onRetry ? <Button label="Try again" icon={RefreshCw} variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function OfflineNotice({ message = 'This needs an internet connection. Your offline data is still available.' }: { message?: string }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: colors.warningSoft, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm }]} accessibilityRole="alert">
      <CloudOff size={18} color={colors.warning} />
      <AppText variant="label" style={{ color: colors.warning, flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

/** Global strip shown under the status bar while offline. */
export function OfflineBanner() {
  const online = useIsOnline();
  const { colors } = useTheme();
  if (online) return null;
  return (
    <View style={[styles.banner, { backgroundColor: colors.text }]} accessibilityRole="alert" accessibilityLabel="You are offline. Changes will sync when you reconnect.">
      <CloudOff size={14} color={colors.background} />
      <AppText variant="caption" style={{ color: colors.background }}>
        Offline — changes are saved on this device and will sync later
      </AppText>
    </View>
  );
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: DimensionValue; height?: number; radius?: number; style?: ViewStyle }) {
  const { colors, reduceMotion } = useTheme();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (reduceMotion) return;
    o.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o, reduceMotion]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceSunken }, s, style]} />;
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const { spacing, colors, radii } = useTheme();
  return (
    <View style={{ gap: spacing.md }} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.lg }}>
          <Skeleton width={26} height={26} radius={13} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={`${70 - i * 8}%`} height={14} />
            <Skeleton width="40%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  notice: { flexDirection: 'row', alignItems: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 12 },
});
