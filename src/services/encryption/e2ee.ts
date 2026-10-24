import { scryptAsync } from '@noble/hashes/scrypt.js';

import { base64ToBytes, bytesToBase64, concatBytes, utf8ToBytes, wipe } from '@/lib/bytes';
import { AppError } from '@/lib/errors';

import { getAead, KEY_LENGTH, NONCE_LENGTH } from './aead';

/**
 * Optional zero-knowledge mode.
 *
 * A random 256-bit Data Encryption Key (DEK) encrypts documents on the device
 * BEFORE upload. The DEK is wrapped with a Key Encryption Key derived from a
 * vault passphrase that is separate from the login password and never leaves
 * the device:
 *
 *   KEK = scrypt(passphrase, salt, N=2^15, r=8, p=1, dkLen=32)
 *   wrapped = nonce(12) || AES-256-GCM(KEK, nonce, DEK, aad="taskora/e2ee/v1/"+userId)
 *
 * The server stores only salt + wrapped DEK, so a new device can unwrap it with
 * the passphrase. If the passphrase is forgotten, e2ee documents are
 * unrecoverable — there is deliberately no reset path.
 */

export type KdfParams = { alg: 'scrypt'; N: number; r: number; p: number };
export const DEFAULT_KDF: KdfParams = { alg: 'scrypt', N: 2 ** 15, r: 8, p: 1 };

export type WrappedKey = { salt: string; wrapped: string; kdf: string };

const aadFor = (userId: string) => utf8ToBytes(`taskora/e2ee/v1/${userId}`);

export async function deriveKek(passphrase: string, salt: Uint8Array, kdf: KdfParams = DEFAULT_KDF): Promise<Uint8Array> {
  if (passphrase.normalize('NFKC').length < 10) throw new AppError('validation', { userMessage: 'Use a vault passphrase of at least 10 characters.' });
  return scryptAsync(utf8ToBytes(passphrase.normalize('NFKC')), salt, { N: kdf.N, r: kdf.r, p: kdf.p, dkLen: KEY_LENGTH });
}

export async function wrapDataKey(params: {
  userId: string;
  passphrase: string;
  dek: Uint8Array;
  salt: Uint8Array;
  nonce: Uint8Array;
  kdf?: KdfParams;
}): Promise<WrappedKey> {
  const kdf = params.kdf ?? DEFAULT_KDF;
  const kek = await deriveKek(params.passphrase, params.salt, kdf);
  try {
    const aead = await getAead();
    const sealed = await (await aead.importKey(kek)).seal(params.nonce, params.dek, aadFor(params.userId));
    return { salt: bytesToBase64(params.salt), wrapped: bytesToBase64(concatBytes(params.nonce, sealed)), kdf: JSON.stringify(kdf) };
  } finally {
    wipe(kek);
  }
}

export async function unwrapDataKey(params: { userId: string; passphrase: string; wrapped: WrappedKey }): Promise<Uint8Array> {
  const kdf = JSON.parse(params.wrapped.kdf) as KdfParams;
  if (kdf.alg !== 'scrypt' || kdf.N < 2 ** 14 || kdf.r < 8) throw new AppError('crypto', { message: 'weak or unknown kdf' });
  const kek = await deriveKek(params.passphrase, base64ToBytes(params.wrapped.salt), kdf);
  try {
    const blob = base64ToBytes(params.wrapped.wrapped);
    const aead = await getAead();
    const dek = await (await aead.importKey(kek)).open(blob.slice(0, NONCE_LENGTH), blob.slice(NONCE_LENGTH), aadFor(params.userId));
    if (dek.length !== KEY_LENGTH) throw new Error('bad key length');
    return dek;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('crypto', { cause: e, userMessage: 'That vault passphrase is not correct.' });
  } finally {
    wipe(kek);
  }
}
