import { Tabs } from 'expo-router';
import { CalendarDays, FolderLock, House, ListTodo, UserRound } from 'lucide-react-native';
import { Platform, StyleSheet } from 'react-native';

import { fontFamilies, useTheme } from '@/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarLabelStyle: { fontFamily: fontFamilies.semibold, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 86 : 66,
          paddingTop: 6,
        },
        tabBarItemStyle: { paddingBottom: Platform.OS === 'android' ? 8 : 0 },
        animation: theme.reduceMotion ? 'none' : 'shift',
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <House color={color} size={size} />, tabBarAccessibilityLabel: 'Today dashboard' }} />
      <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color, size }) => <ListTodo color={color} size={size} /> }} />
      <Tabs.Screen name="documents" options={{ title: 'Vault', tabBarIcon: ({ color, size }) => <FolderLock color={color} size={size} />, tabBarAccessibilityLabel: 'Document vault' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} />, tabBarAccessibilityLabel: 'Profile and settings' }} />
    </Tabs>
  );
}
