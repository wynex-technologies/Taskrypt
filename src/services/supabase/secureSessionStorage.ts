import { gcm } from '@noble/ciphers/aes.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { base64ToBytes, bytesToBase64, bytesToUtf8, concatBytes, utf8ToBytes } from '@/lib/bytes';

/**
 * Session persistence for supabase-js.
 *
 * SecureStore (Keychain/Keystore) has a ~2 KB value limit that a Supabase session
 * can exceed, so the session JSON is AES-256-GCM encrypted with a random key that
 * lives in SecureStore, and only the ciphertext is written to AsyncStorage.
 * Refresh tokens are therefore never at rest in plaintext.
 */
const KEY_NAME = 'taskora.session-key';
const PREFIX = 'taskora.session.';
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

let keyPromise: Promise<Uint8Array> | null = null;

function sessionKey(): Promise<Uint8Array> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const existing = await SecureStore.getItemAsync(KEY_NAME, OPTS);
      if (existing) return base64ToBytes(existing);
      const key = Crypto.getRandomBytes(32);
      await SecureStore.setItemAsync(KEY_NAME, bytesToBase64(key), OPTS);
      return key;
    })().catch((e) => {
      keyPromise = null;
      throw e;
    });
  }
  return keyPromise;
}

function aad(name: string) {
  return utf8ToBytes(`taskora/session/${name}`);
}

export const secureSessionStorage = {
  async getItem(name: string): Promise<string | null> {
    const blob = await AsyncStorage.getItem(PREFIX + name);
    if (!blob) return null;
    try {
      const raw = base64ToBytes(blob);
      const key = await sessionKey();
      return bytesToUtf8(gcm(key, raw.slice(0, 12), aad(name)).decrypt(raw.slice(12)));
    } catch {
      // Tampered or key lost (e.g. app reinstalled): treat as signed out.
      await AsyncStorage.removeItem(PREFIX + name);
      return null;
    }
  },
  async setItem(name: string, value: string): Promise<void> {
    const key = await sessionKey();
    const nonce = Crypto.getRandomBytes(12);
    const sealed = gcm(key, nonce, aad(name)).encrypt(utf8ToBytes(value));
    await AsyncStorage.setItem(PREFIX + name, bytesToBase64(concatBytes(nonce, sealed)));
  },
  async removeItem(name: string): Promise<void> {
    await AsyncStorage.removeItem(PREFIX + name);
  },
};

/** Remove every persisted session blob and rotate the session key. */
export async function clearSessionStorage(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  await AsyncStorage.multiRemove(keys);
  await SecureStore.deleteItemAsync(KEY_NAME, OPTS).catch(() => undefined);
  keyPromise = null;
}
