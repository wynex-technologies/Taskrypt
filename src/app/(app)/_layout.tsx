import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

export default function AppLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: theme.reduceMotion ? 'fade' : 'default',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="tasks/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="tasks/[id]/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="documents/upload" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
