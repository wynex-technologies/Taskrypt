import { router } from 'expo-router';
import { CircleAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-react-native';
import { useEffect } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AppText, ScalePressable } from '@/components';
import { relativeTime } from '@/lib/time';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

import { useSyncStore } from './syncService';

/** Compact sync indicator; opens the sync status screen. */
export function SyncBadge() {
  const theme = useTheme();
  const online = useIsOnline();
  const phase = useSyncStore((s) => s.phase);
  const pending = useSyncStore((s) => s.queue.pending + s.queue.inflight);
  const failed = useSyncStore((s) => s.queue.failed);
  const last = useSyncStore((s) => s.lastSyncAt);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (phase === 'syncing' && !theme.reduceMotion) spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    else {
      cancelAnimation(spin);
      spin.value = 0;
    }
  }, [phase, spin, theme.reduceMotion]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  let Icon = CloudCheck;
  let color = theme.colors.success;
  let label = last ? `Synced ${relativeTime(last)}` : 'Synced';
  if (!online) {
    Icon = CloudOff;
    color = theme.colors.warning;
    label = pending ? `Offline · ${pending} waiting` : 'Offline';
  } else if (phase === 'syncing') {
    Icon = RefreshCw;
    color = theme.colors.info;
    label = 'Syncing…';
  } else if (failed > 0 || phase === 'error') {
    Icon = CircleAlert;
    color = theme.colors.danger;
    label = failed ? `${failed} need attention` : 'Sync issue';
  } else if (pending > 0) {
    Icon = RefreshCw;
    color = theme.colors.info;
    label = `${pending} waiting`;
  }

  return (
    <ScalePressable
      onPress={() => router.push('/settings/sync')}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' }}
    >
      <Animated.View style={spinStyle}>
        <Icon size={14} color={color} />
      </Animated.View>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
    </ScalePressable>
  );
}
