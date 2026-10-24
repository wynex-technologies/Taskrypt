// Per-weight imports so only the six font files we use are bundled.
import { Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces/500Medium_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OfflineBanner, ToastHost } from '@/components';
import { bootstrapAuth, watchConnectivityForRevalidation } from '@/features/auth/authService';
import { isAuthenticated, useAuthStore } from '@/features/auth/authStore';
import { LockOverlay } from '@/features/security/LockOverlay';
import { startAppLock, stopAppLock } from '@/features/security/appLock';
import { env } from '@/lib/env';
import { configureNotifications, onReminderTapped } from '@/services/notifications/reminders';
import { queryClient } from '@/services/queryClient';
import { startNetworkMonitoring } from '@/stores/networkStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
// Fade into the themed splash so a non-default palette doesn't snap in.
SplashScreen.setOptions({ duration: 300, fade: true });

export { ErrorBoundary } from '@/features/errors/RootErrorBoundary';

function RootNavigator() {
  const theme = useTheme();
  const status = useAuthStore((s) => s.status);
  const authed = isAuthenticated({ status });
  const booted = status !== 'booting';

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => undefined);
  }, [theme.colors.background]);

  // Lock only exists while signed in. Restoring a saved session at launch requires
  // unlocking; a fresh password sign-in does not.
  const atLaunch = useRef(true);
  useEffect(() => {
    if (!booted) return;
    if (authed) startAppLock(atLaunch.current);
    else stopAppLock();
    atLaunch.current = false;
  }, [authed, booted]);

  // Tapping a reminder opens its task.
  useEffect(() => {
    if (!authed) return;
    return onReminderTapped((url) => router.push(url as never));
  }, [authed]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background }, animation: theme.reduceMotion ? 'fade' : 'default' }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="privacy" />
        <Stack.Protected guard={!env.isBackendConfigured}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={booted && !authed && status !== 'recovery'}>
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'recovery'}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Protected guard={authed}>
          <Stack.Screen name="(app)" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      {authed ? <LockOverlay /> : null}
      <ToastHost />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    configureNotifications();
    const stopNet = startNetworkMonitoring();
    watchConnectivityForRevalidation();
    // Wait for persisted preferences, then restore the session.
    const start = () => void bootstrapAuth().catch(() => useAuthStore.getState().setState({ status: 'signedOut' }));
    if (usePreferencesStore.persist.hasHydrated()) start();
    else {
      const unsub = usePreferencesStore.persist.onFinishHydration(() => {
        unsub();
        start();
      });
    }
    return stopNet;
  }, []);

  // Keep the native splash up until the saved colour palette is known, so the
  // themed splash never flashes the default colours first.
  const prefsHydrated = useSyncExternalStore(usePreferencesStore.persist.onFinishHydration, usePreferencesStore.persist.hasHydrated);

  const ready = (fontsLoaded || !!fontError) && prefsHydrated;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
