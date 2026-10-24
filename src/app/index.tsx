import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Credit } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { isAuthenticated, useAuthStore } from '@/features/auth/authStore';
import { env } from '@/lib/env';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

/** Animated splash: shows Kora while the session is restored, then routes. */
export default function Splash() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const status = useAuthStore((s) => s.status);
  const onboarded = usePreferencesStore((s) => s.onboardingComplete);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), theme.reduceMotion ? 300 : 1300);
    return () => clearTimeout(t);
  }, [theme.reduceMotion]);

  if (minElapsed && status !== 'booting') {
    if (!env.isBackendConfigured) return <Redirect href="/setup" />;
    if (isAuthenticated({ status })) return <Redirect href="/home" />;
    if (status === 'recovery') return <Redirect href="/reset-password" />;
    return <Redirect href={onboarded ? '/sign-in' : '/onboarding'} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.primarySoft }]}>
      <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.duration(400)}>
        <Mascot size={150} mood="welcome" />
      </Animated.View>
      <Animated.View entering={theme.reduceMotion ? undefined : FadeInDown.delay(250).duration(500)} style={{ alignItems: 'center', gap: 6 }}>
        <AppText variant="hero" color="primary" accessibilityRole="header">
          Taskrypt
        </AppText>
        <AppText color="textMuted">Plans and papers, safely in one place.</AppText>
      </Animated.View>
      <Animated.View entering={theme.reduceMotion ? undefined : FadeIn.delay(500).duration(500)} style={[styles.credit, { bottom: insets.bottom + 24 }]}>
        <Credit style={{ color: theme.colors.textMuted }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  credit: { position: 'absolute', left: 16, right: 16 },
});
