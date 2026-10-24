import type { ErrorBoundaryProps } from 'expo-router';
import { useColorScheme, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { getCharacter } from '@/features/animation/characters';
import { VectorMascot } from '@/features/animation/VectorMascot';
import { createLogger } from '@/lib/logger';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { buildTheme, ThemeProvider } from '@/theme';

const log = createLogger('crash');

/** Last-resort screen for render errors. Never shows stack traces to users. */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  log.error('render error', { name: error.name });
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = buildTheme(scheme, false);
  return (
    <ThemeProvider>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: theme.colors.background }}>
        <VectorMascot character={getCharacter(usePreferencesStore.getState().mascotCharacter)} mood="error" size={120} reduceMotion />
        <AppText variant="title" align="center">
          Something went sideways
        </AppText>
        <AppText color="textMuted" align="center">
          Your tasks and documents are safe on this device. Try again, and if it keeps happening restart the app.
        </AppText>
        <Button label="Try again" onPress={retry} />
      </View>
    </ThemeProvider>
  );
}

export { RootErrorBoundary as ErrorBoundary };
