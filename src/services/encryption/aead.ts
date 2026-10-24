import { gcm } from '@noble/ciphers/aes.js';

import { createLogger } from '@/lib/logger';

/**
 * AES-256-GCM behind a small interface so the platform implementation
 * (expo-crypto → CryptoKit / javax.crypto) can be used on device while the
 * audited pure-JS @noble/ciphers implementation backs tests and acts as a
 * fallback. Both produce standard `ciphertext || 16-byte tag` output.
 */
export interface AeadKey {
  seal(nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
  open(nonce: Uint8Array, sealed: Uint8Array, aad: Uint8Array): Promise<Uint8Array>;
}

export interface AeadProvider {
  readonly name: string;
  importKey(raw: Uint8Array): Promise<AeadKey>;
}

export const TAG_LENGTH = 16;
export const NONCE_LENGTH = 12;
export const KEY_LENGTH = 32;

const log = createLogger('crypto');

function assertKey(raw: Uint8Array) {
  if (raw.length !== KEY_LENGTH) throw new Error('AES-256 requires a 32-byte key');
}

export const nobleProvider: AeadProvider = {
  name: 'noble',
  async importKey(raw) {
    assertKey(raw);
    const key = raw.slice();
    return {
      async seal(nonce, plaintext, aad) {
        return gcm(key, nonce, aad).encrypt(plaintext);
      },
      async open(nonce, sealed, aad) {
        return gcm(key, nonce, aad).decrypt(sealed);
      },
    };
  },
};

async function createNativeProvider(): Promise<AeadProvider | null> {
  try {
    const Crypto = await import('expo-crypto');
    if (typeof Crypto.aesEncryptAsync !== 'function' || !Crypto.AESEncryptionKey) return null;
    return {
      name: 'native',
      async importKey(raw) {
        assertKey(raw);
        const key = await Crypto.AESEncryptionKey.import(raw);
        return {
          async seal(nonce, plaintext, aad) {
            const sealed = await Crypto.aesEncryptAsync(plaintext, key, {
              nonce: { bytes: nonce },
              tagLength: TAG_LENGTH,
              additionalData: aad,
            });
            return sealed.ciphertext({ includeTag: true });
          },
          async open(nonce, sealed, aad) {
            const data = Crypto.AESSealedData.fromParts(nonce, sealed, TAG_LENGTH);
            return Crypto.aesDecryptAsync(data, key, { additionalData: aad });
          },
        };
      },
    };
  } catch {
    return null;
  }
}

let provider: AeadProvider | null = null;

export function setAeadProvider(p: AeadProvider | null) {
  provider = p;
}

/**
 * Select the native provider only after a known-answer interoperability check
 * against noble — if a platform ever disagrees, encrypted files stay portable.
 */
export async function getAead(): Promise<AeadProvider> {
  if (provider) return provider;
  const native = await createNativeProvider();
  if (native) {
    try {
      const key = new Uint8Array(KEY_LENGTH).map((_, i) => i);
      const nonce = new Uint8Array(NONCE_LENGTH).map((_, i) => 200 - i);
      const aad = new Uint8Array([1, 2, 3]);
      const msg = new Uint8Array(37).map((_, i) => i * 7);
      const a = await (await native.importKey(key)).seal(nonce, msg, aad);
      const b = await (await nobleProvider.importKey(key)).seal(nonce, msg, aad);
      const same = a.length === b.length && a.every((v, i) => v === b[i]);
      if (same) {
        provider = native;
        return provider;
      }
      log.warn('native AES-GCM failed interoperability check; using noble');
    } catch {
      log.warn('native AES-GCM unavailable; using noble');
    }
  }
  provider = nobleProvider;
  return provider;
}
