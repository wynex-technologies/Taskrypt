import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { base64ToBytes, bytesToBase64 } from '@/lib/bytes';
import { AppError } from '@/lib/errors';

import { KEY_LENGTH } from './aead';

/**
 * Per-user device vault key. Generated on this device from the platform CSPRNG
 * and stored only in the iOS Keychain / Android Keystore-backed SecureStore with
 * "this device only, when unlocked" accessibility — never beside the encrypted
 * files, never in SQLite, never synced.
 */

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const keyName = (userId: string, purpose: 'vault' | 'e2ee') => {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('invalid user id');
  return `taskora.${purpose}.${userId.toLowerCase()}`;
};

const cache = new Map<string, Uint8Array>();

export async function getOrCreateVaultKey(userId: string): Promise<Uint8Array> {
  const name = keyName(userId, 'vault');
  const cached = cache.get(name);
  if (cached) return cached;
  let stored: string | null = null;
  try {
    stored = await SecureStore.getItemAsync(name, SECURE_OPTS);
  } catch (e) {
    throw new AppError('crypto', { cause: e, message: 'secure storage unavailable' });
  }
  let key: Uint8Array;
  if (stored) {
    key = base64ToBytes(stored);
    if (key.length !== KEY_LENGTH) throw new AppError('crypto', { message: 'stored key has wrong length' });
  } else {
    key = Crypto.getRandomBytes(KEY_LENGTH);
    await SecureStore.setItemAsync(name, bytesToBase64(key), SECURE_OPTS);
  }
  cache.set(name, key);
  return key;
}

/** The unwrapped end-to-end (zero-knowledge) data key, if the user unlocked it on this device. */
export async function getE2eeKey(userId: string): Promise<Uint8Array | null> {
  const name = keyName(userId, 'e2ee');
  const cached = cache.get(name);
  if (cached) return cached;
  const stored = await SecureStore.getItemAsync(name, SECURE_OPTS);
  if (!stored) return null;
  const key = base64ToBytes(stored);
  cache.set(name, key);
  return key;
}

export async function storeE2eeKey(userId: string, key: Uint8Array): Promise<void> {
  const name = keyName(userId, 'e2ee');
  await SecureStore.setItemAsync(name, bytesToBase64(key), SECURE_OPTS);
  cache.set(name, key.slice());
}

/** Forget keys in memory (on lock / sign-out). */
export function clearKeyCache() {
  for (const k of cache.values()) k.fill(0);
  cache.clear();
}

/**
 * Destroy the device keys. Any offline copy encrypted with them becomes
 * permanently unreadable — this is the crypto-shredding step of a wipe.
 */
export async function destroyKeys(userId: string): Promise<void> {
  clearKeyCache();
  await Promise.allSettled([
    SecureStore.deleteItemAsync(keyName(userId, 'vault'), SECURE_OPTS),
    SecureStore.deleteItemAsync(keyName(userId, 'e2ee'), SECURE_OPTS),
  ]);
}
