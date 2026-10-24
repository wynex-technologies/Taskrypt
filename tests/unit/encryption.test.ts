import { randomBytes } from 'node:crypto';

import { nobleProvider, setAeadProvider, TAG_LENGTH } from '@/services/encryption/aead';
import { DEFAULT_KDF, unwrapDataKey, wrapDataKey } from '@/services/encryption/e2ee';
import { chunkNonce, decryptStream, encryptedSize, encryptStream, HEADER_LENGTH, memorySink, memorySource } from '@/services/encryption/vaultFormat';

const DOC = '6b1f3a1e-1a2b-4c3d-8e4f-0123456789ab';
const key = () => new Uint8Array(randomBytes(32));
const salt = () => new Uint8Array(randomBytes(16));

beforeAll(() => setAeadProvider(nobleProvider));

async function encrypt(plain: Uint8Array, k: Uint8Array, chunkLog2 = 10, docId = DOC) {
  const sink = memorySink();
  await encryptStream({ aead: nobleProvider, masterKey: k, documentId: docId, salt: salt(), source: memorySource(plain), sink, chunkLog2 });
  return sink.bytes();
}

async function decrypt(blob: Uint8Array, k: Uint8Array, docId = DOC) {
  const sink = memorySink();
  await decryptStream({ aead: nobleProvider, masterKey: k, documentId: docId, source: memorySource(blob), sink });
  return sink.bytes();
}

describe('TKV1 chunked AES-256-GCM vault format', () => {
  it.each([0, 1, 1023, 1024, 1025, 4096, 5000])('round-trips %i bytes', async (n) => {
    const k = key();
    const plain = new Uint8Array(randomBytes(n));
    const blob = await encrypt(plain, k);
    expect(blob.length).toBe(encryptedSize(n, 10));
    expect(Buffer.from(await decrypt(blob, k)).equals(Buffer.from(plain))).toBe(true);
  });

  it('never contains the plaintext', async () => {
    const plain = new TextEncoder().encode('TOP SECRET passport number 123456789 '.repeat(50));
    const blob = await encrypt(plain, key());
    expect(Buffer.from(blob).includes(Buffer.from('passport'))).toBe(false);
  });

  it('uses a fresh salt (and therefore subkey) per encryption', async () => {
    const k = key();
    const plain = new Uint8Array(100);
    const a = await encrypt(plain, k);
    const b = await encrypt(plain, k);
    expect(Buffer.from(a.slice(8, 24)).equals(Buffer.from(b.slice(8, 24)))).toBe(false);
    expect(Buffer.from(a.slice(HEADER_LENGTH)).equals(Buffer.from(b.slice(HEADER_LENGTH)))).toBe(false);
  });

  it('derives unique nonces per chunk and marks the final chunk', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) for (const last of [false, true]) seen.add(Buffer.from(chunkNonce(i, last)).toString('hex'));
    expect(seen.size).toBe(600);
    expect(chunkNonce(3, true)[11]).toBe(1);
  });

  it('rejects a flipped ciphertext bit', async () => {
    const k = key();
    const blob = await encrypt(new Uint8Array(3000), k);
    blob[HEADER_LENGTH + 10]! ^= 1;
    await expect(decrypt(blob, k)).rejects.toMatchObject({ code: 'crypto' });
  });

  it('rejects header tampering (authenticated as AAD)', async () => {
    const k = key();
    const blob = await encrypt(new Uint8Array(3000), k);
    blob[9]! ^= 0xff; // salt byte
    await expect(decrypt(blob, k)).rejects.toMatchObject({ code: 'crypto' });
  });

  it('rejects truncation at a chunk boundary', async () => {
    const k = key();
    const blob = await encrypt(new Uint8Array(4096), k); // 4 chunks of 1 KiB
    const truncated = blob.slice(0, HEADER_LENGTH + 2 * (1024 + TAG_LENGTH));
    await expect(decrypt(truncated, k)).rejects.toMatchObject({ code: 'crypto' });
  });

  it('rejects reordered chunks', async () => {
    const k = key();
    const blob = await encrypt(new Uint8Array(randomBytes(3072)), k);
    const c = 1024 + TAG_LENGTH;
    const swapped = new Uint8Array(blob);
    swapped.set(blob.slice(HEADER_LENGTH + c, HEADER_LENGTH + 2 * c), HEADER_LENGTH);
    swapped.set(blob.slice(HEADER_LENGTH, HEADER_LENGTH + c), HEADER_LENGTH + c);
    await expect(decrypt(swapped, k)).rejects.toMatchObject({ code: 'crypto' });
  });

  it('binds ciphertext to the document id and key', async () => {
    const k = key();
    const blob = await encrypt(new Uint8Array(500), k);
    await expect(decrypt(blob, k, '00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'crypto' });
    await expect(decrypt(blob, key())).rejects.toMatchObject({ code: 'crypto' });
  });

  it('rejects files that are not TKV1', async () => {
    await expect(decrypt(new Uint8Array(100), key())).rejects.toMatchObject({ code: 'file_corrupted' });
  });
});

describe('zero-knowledge key wrapping', () => {
  const user = '11111111-1111-4111-8111-111111111111';
  const fast = { ...DEFAULT_KDF, N: 2 ** 14 };

  it('wraps and unwraps the data key with the passphrase', async () => {
    const dek = key();
    const wrapped = await wrapDataKey({ userId: user, passphrase: 'correct horse battery', dek, salt: salt(), nonce: new Uint8Array(randomBytes(12)), kdf: fast });
    expect(wrapped.wrapped).not.toContain(Buffer.from(dek).toString('base64'));
    const out = await unwrapDataKey({ userId: user, passphrase: 'correct horse battery', wrapped });
    expect(Buffer.from(out).equals(Buffer.from(dek))).toBe(true);
  });

  it('fails with the wrong passphrase or for another user', async () => {
    const wrapped = await wrapDataKey({ userId: user, passphrase: 'correct horse battery', dek: key(), salt: salt(), nonce: new Uint8Array(randomBytes(12)), kdf: fast });
    await expect(unwrapDataKey({ userId: user, passphrase: 'wrong horse battery!', wrapped })).rejects.toMatchObject({ code: 'crypto' });
    await expect(unwrapDataKey({ userId: '22222222-2222-4222-8222-222222222222', passphrase: 'correct horse battery', wrapped })).rejects.toMatchObject({ code: 'crypto' });
  });

  it('refuses short passphrases and weakened KDF parameters', async () => {
    await expect(wrapDataKey({ userId: user, passphrase: 'short', dek: key(), salt: salt(), nonce: new Uint8Array(12), kdf: fast })).rejects.toMatchObject({ code: 'validation' });
    const wrapped = await wrapDataKey({ userId: user, passphrase: 'correct horse battery', dek: key(), salt: salt(), nonce: new Uint8Array(12), kdf: fast });
    await expect(unwrapDataKey({ userId: user, passphrase: 'correct horse battery', wrapped: { ...wrapped, kdf: JSON.stringify({ alg: 'scrypt', N: 16, r: 1, p: 1 }) } })).rejects.toMatchObject({ code: 'crypto' });
  });
});
