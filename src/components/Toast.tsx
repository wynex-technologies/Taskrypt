import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { userMessageOf } from '@/lib/errors';
import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { ScalePressable } from './Pressable';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; kind: ToastKind; message: string; action?: { label: string; onPress: () => void } };

type ToastState = { current: ToastItem | null; show: (t: Omit<ToastItem, 'id'>) => void; hide: () => void };

let seq = 0;
export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (t) => set({ current: { ...t, id: ++seq } }),
  hide: () => set({ current: null }),
}));

export const toast = {
  success: (message: string, action?: ToastItem['action']) => useToastStore.getState().show({ kind: 'success', message, action }),
  info: (message: string, action?: ToastItem['action']) => useToastStore.getState().show({ kind: 'info', message, action }),
  error: (e: unknown) => useToastStore.getState().show({ kind: 'error', message: typeof e === 'string' ? e : userMessageOf(e) }),
};

export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(hide, current.action ? 5000 : 3200);
    return () => clearTimeout(t);
  }, [current, hide]);

  if (!current) return null;
  const Icon = current.kind === 'success' ? CircleCheck : current.kind === 'error' ? CircleAlert : Info;
  const tint = current.kind === 'success' ? theme.colors.success : current.kind === 'error' ? theme.colors.danger : theme.colors.info;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: insets.bottom + 84, paddingHorizontal: 16 }]}>
      <Animated.View
        key={current.id}
        entering={theme.reduceMotion ? undefined : FadeInUp.springify().damping(18)}
        exiting={theme.reduceMotion ? undefined : FadeOutDown.duration(160)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: theme.colors.text, borderRadius: theme.radii.lg }, theme.shadow(3)]}
      >
        <Icon size={20} color={tint === theme.colors.danger ? '#F28B95' : tint} />
        <AppText variant="label" style={{ color: theme.colors.background, flex: 1 }}>
          {current.message}
        </AppText>
        {current.action ? (
          <ScalePressable
            onPress={() => {
              current.action?.onPress();
              hide();
            }}
            accessibilityRole="button"
            accessibilityLabel={current.action.label}
            hitSlop={10}
          >
            <AppText variant="label" style={{ color: theme.colors.primarySoft }}>
              {current.action.label}
            </AppText>
          </ScalePressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, alignSelf: 'center', width: '100%', maxWidth: 520 },
});
