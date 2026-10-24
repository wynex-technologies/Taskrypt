import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications loads native modules at import time that Expo Go on Android
 * no longer ships (ExpoTopicSubscriptionModule), which crashes the app on launch.
 * Load it lazily and only where it exists; in Expo Go reminders are disabled and
 * every caller degrades gracefully. Development and store builds get full support.
 */
export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isRunningInExpoGo() && Platform.OS === 'android') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function notificationsAvailable(): boolean {
  return getNotifications() !== null;
}
