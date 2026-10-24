/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Jest environment for Taskrypt. Native modules are replaced with faithful
 * in-memory fakes; SQL runs on a real SQLite engine (node:sqlite) and crypto
 * on the audited @noble implementations.
 */
import { webcrypto } from 'node:crypto';

process.env.EXPO_PUBLIC_APP_ENV = 'test';
// Public test values only; the Supabase client itself is mocked per test.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-0123456789abcdef';
process.env.EXPO_PUBLIC_OFFLINE_GRACE_DAYS = '14';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });

jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
  randomUUID: () => nodeCrypto.randomUUID(),
  getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
  getRandomBytesAsync: async (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
  // No native AES in tests: the AEAD layer falls back to @noble/ciphers.
  aesEncryptAsync: undefined,
  AESEncryptionKey: undefined,
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
    isAvailableAsync: async () => true,
  };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(async () => `notif-${Math.random().toString(36).slice(2)}`),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true, type: 'WIFI' })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  NetworkStateType: { CELLULAR: 'CELLULAR', WIFI: 'WIFI' },
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [1]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
}));

jest.mock('expo-file-system', () => require('./fakes/fileSystem'));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-sqlite', () => ({}));

jest.mock('react-native-reanimated', () => require('./fakes/reanimated'));
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
