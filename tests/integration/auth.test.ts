import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { databaseNameFor, getOpenDbUserId } from '@/database';
import { bootstrapAuth, revalidateSession, signOut } from '@/features/auth/authService';
import { useAuthStore } from '@/features/auth/authStore';
import { isGrantValid, readGrant, writeGrant } from '@/features/auth/offlineGrant';
import { getOrCreateVaultKey } from '@/services/encryption/keyManager';
import { clearSessionStorage, secureSessionStorage } from '@/services/supabase/secureSessionStorage';
import { taskRepository } from '@/repositories/taskRepository';
import { useNetworkStore } from '@/stores/networkStore';
import { usePreferencesStore } from '@/stores/preferencesStore';

import { databaseExists, onDevice, resetAllDevices, USER_A } from '../helpers/db';

type Fn = jest.Mock;
const mockAuth: Record<string, Fn> = {
  getSession: jest.fn(),
  getUser: jest.fn(),
  refreshSession: jest.fn(),
  signOut: jest.fn(async () => ({ error: null })),
  onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};

jest.mock('@/services/supabase/client', () => ({
  getSupabase: () => ({ auth: mockAuth, rpc: jest.fn(async () => ({ data: [], error: null })), from: jest.fn() }),
  isSupabaseConfigured: () => true,
}));
// Sync is exercised elsewhere; keep auth tests focused.
jest.mock('@/features/sync/syncService', () => ({
  startAutoSync: jest.fn(),
  stopAutoSync: jest.fn(),
  syncNow: jest.fn(async () => null),
  setSyncAuthFailureHandler: jest.fn(),
  useSyncStore: { getState: () => ({ queue: { pending: 0, inflight: 0, failed: 0 } }) },
}));

const user = { id: USER_A, email: 'ann@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' };
const session = { access_token: 'a', refresh_token: 'r', user };
const offline = () => useNetworkStore.setState({ isOnline: false });
const online = () => useNetworkStore.setState({ isOnline: true });
const status = () => useAuthStore.getState().status;

beforeEach(async () => {
  jest.clearAllMocks();
  await resetAllDevices();
  (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
  await AsyncStorage.clear();
  useAuthStore.setState({ status: 'booting', user: null, pendingEmail: null, notice: null });
  usePreferencesStore.setState({ logoutPolicy: 'wipe' });
  online();
});

describe('offline session policy', () => {
  it('validates the grant window', () => {
    const now = Date.parse('2026-10-24T00:00:00Z');
    const g = (daysAgo: number) => ({ userId: USER_A, email: 'x', verifiedAt: new Date(now - daysAgo * 86_400_000).toISOString() });
    expect(isGrantValid(g(1), now, 14)).toBe(true);
    expect(isGrantValid(g(15), now, 14)).toBe(false);
    expect(isGrantValid(g(-1), now, 14)).toBe(false); // future (clock rolled back)
    expect(isGrantValid(g(1), now, 0)).toBe(false); // policy disabled
    expect(isGrantValid(null, now, 14)).toBe(false);
  });

  it('opens offline with a valid grant when the server is unreachable', async () => {
    await writeGrant(USER_A, user.email);
    offline();
    mockAuth.getSession!.mockRejectedValue(Object.assign(new Error('Network request failed'), { name: 'AuthRetryableFetchError' }));
    await bootstrapAuth();
    expect(status()).toBe('offline');
    expect(getOpenDbUserId()).toBe(USER_A);
  });

  it('stays signed out offline when the grant expired', async () => {
    await SecureStore.setItemAsync('taskora.offline-grant', JSON.stringify({ userId: USER_A, email: 'x', verifiedAt: '2020-01-01T00:00:00.000Z' }));
    offline();
    mockAuth.getSession!.mockRejectedValue(new Error('Network request failed'));
    await bootstrapAuth();
    expect(status()).toBe('signedOut');
    expect(getOpenDbUserId()).toBeNull();
  });
});

describe('online session handling', () => {
  it('signs in with a server-validated session and records the offline grant', async () => {
    mockAuth.getSession!.mockResolvedValue({ data: { session }, error: null });
    mockAuth.getUser!.mockResolvedValue({ data: { user }, error: null });
    await bootstrapAuth();
    expect(status()).toBe('signedIn');
    expect((await readGrant())?.userId).toBe(USER_A);
  });

  it('routes unverified users to e-mail verification', async () => {
    const unverified = { ...user, email_confirmed_at: null };
    mockAuth.getSession!.mockResolvedValue({ data: { session: { ...session, user: unverified } }, error: null });
    mockAuth.getUser!.mockResolvedValue({ data: { user: unverified }, error: null });
    await bootstrapAuth();
    expect(status()).toBe('signedOut');
    expect(useAuthStore.getState().pendingEmail).toBe(user.email);
  });

  it('signs out when the server rejects an expired / revoked session', async () => {
    mockAuth.getSession!.mockResolvedValue({ data: { session }, error: null });
    mockAuth.getUser!.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'JWT expired' } });
    await bootstrapAuth();
    expect(status()).toBe('signedOut');
    expect(useAuthStore.getState().notice).toMatch(/sign in again/i);
    expect(await readGrant()).toBeNull();
  });

  it('wipes local data when the account was deleted on another device', async () => {
    await onDevice('phone-a', USER_A);
    await taskRepository.create({ title: 'left behind' });
    usePreferencesStore.setState({ logoutPolicy: 'keep-encrypted' });
    mockAuth.getSession!.mockResolvedValue({ data: { session }, error: null });
    mockAuth.getUser!.mockResolvedValue({ data: { user: null }, error: { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' } });
    await bootstrapAuth();
    expect(status()).toBe('signedOut');
    expect(databaseExists(databaseNameFor(USER_A))).toBe(false);
  });

  it('forces sign-out when revalidation after reconnecting is rejected', async () => {
    await writeGrant(USER_A, user.email);
    offline();
    mockAuth.getSession!.mockRejectedValue(new Error('Network request failed'));
    await bootstrapAuth();
    expect(status()).toBe('offline');
    online();
    mockAuth.refreshSession!.mockResolvedValue({ data: { session: null }, error: { status: 400, code: 'refresh_token_not_found', message: 'Invalid Refresh Token' } });
    await revalidateSession();
    expect(status()).toBe('signedOut');
  });
});

describe('sign-out and local data cleanup', () => {
  async function signedInWithData() {
    await onDevice('phone-a', USER_A);
    useAuthStore.setState({ status: 'signedIn', user: { id: USER_A, email: user.email, emailVerified: true } });
    await writeGrant(USER_A, user.email);
    await taskRepository.create({ title: 'private' });
    await getOrCreateVaultKey(USER_A);
    await secureSessionStorage.setItem('taskora-auth', JSON.stringify(session));
  }

  it('wipe policy deletes the database, vault keys, grant and session', async () => {
    await signedInWithData();
    expect(databaseExists(databaseNameFor(USER_A))).toBe(true);
    await signOut();
    expect(status()).toBe('signedOut');
    expect(getOpenDbUserId()).toBeNull();
    expect(databaseExists(databaseNameFor(USER_A))).toBe(false);
    expect(await SecureStore.getItemAsync(`taskora.vault.${USER_A}`)).toBeNull();
    expect(await readGrant()).toBeNull();
    expect(await secureSessionStorage.getItem('taskora-auth')).toBeNull();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keep-encrypted policy keeps the encrypted data but removes the offline grant', async () => {
    await signedInWithData();
    usePreferencesStore.setState({ logoutPolicy: 'keep-encrypted' });
    await signOut();
    expect(getOpenDbUserId()).toBeNull();
    expect(databaseExists(databaseNameFor(USER_A))).toBe(true);
    expect(await SecureStore.getItemAsync(`taskora.vault.${USER_A}`)).not.toBeNull();
    expect(await readGrant()).toBeNull(); // cannot reopen offline without a fresh online sign-in
  });

  it('signs out locally even when the network is down', async () => {
    await signedInWithData();
    mockAuth.signOut!.mockRejectedValueOnce(new Error('Network request failed'));
    await signOut();
    expect(status()).toBe('signedOut');
    expect(databaseExists(databaseNameFor(USER_A))).toBe(false);
  });
});

describe('session storage at rest', () => {
  it('stores the session encrypted and drops tampered blobs', async () => {
    const secret = JSON.stringify({ refresh_token: 'super-secret-refresh-token' });
    await secureSessionStorage.setItem('taskora-auth', secret);
    const raw = await AsyncStorage.getItem('taskora.session.taskora-auth');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('super-secret');
    expect(await secureSessionStorage.getItem('taskora-auth')).toBe(secret);

    const bytes = Buffer.from(raw!, 'base64');
    bytes[20] = bytes[20]! ^ 0xff;
    await AsyncStorage.setItem('taskora.session.taskora-auth', bytes.toString('base64'));
    expect(await secureSessionStorage.getItem('taskora-auth')).toBeNull();
    await clearSessionStorage();
  });
});
