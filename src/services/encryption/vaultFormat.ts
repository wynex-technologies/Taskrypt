import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { concatBytes, utf8ToBytes, wipe } from '@/lib/bytes';
import { AppError } from '@/lib/errors';

import { KEY_LENGTH, NONCE_LENGTH, TAG_LENGTH, type AeadProvider } from './aead';

/**
 * TKV1 — Taskrypt's encrypted-file container.
 *
 *   header (24 bytes) = "TKV1" | version=1 | log2(chunkSize) | 0x0000 | salt[16]
 *   body             = chunk_0 … chunk_n, each = AES-256-GCM(ciphertext || tag)
 *
 * Keys: every file gets a fresh random 128-bit salt and a unique subkey
 *   fileKey = HKDF-SHA256(masterKey, salt, "taskora/tkv1/" || documentId)
 * so a nonce can never repeat under the same key across files, and an encrypted
 * blob cannot be swapped onto a different document id.
 *
 * Nonces (STREAM construction): 0x00×7 | chunkIndex (u32 BE) | lastFlag (0/1).
 * The header is authenticated as AAD on every chunk. Reordering, truncation,
 * extension or header tampering all fail authentication.
 */

export const MAGIC = utf8ToBytes('TKV1');
export const HEADER_LENGTH = 24;
export const DEFAULT_CHUNK_LOG2 = 20; // 1 MiB chunks

export type ByteSource = {
  /** Total plaintext/ciphertext size in bytes. */
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
};
export type ByteSink = { write(bytes: Uint8Array): Promise<void> };

export function chunkNonce(index: number, last: boolean): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) throw new Error('chunk index out of range');
  const n = new Uint8Array(NONCE_LENGTH);
  new DataView(n.buffer).setUint32(7, index, false);
  n[11] = last ? 1 : 0;
  return n;
}

export function deriveFileKey(masterKey: Uint8Array, salt: Uint8Array, documentId: string): Uint8Array {
  if (masterKey.length !== KEY_LENGTH) throw new Error('master key must be 32 bytes');
  return hkdf(sha256, masterKey, salt, utf8ToBytes(`taskora/tkv1/${documentId}`), KEY_LENGTH);
}

export function buildHeader(salt: Uint8Array, chunkLog2 = DEFAULT_CHUNK_LOG2): Uint8Array {
  if (salt.length !== 16) throw new Error('salt must be 16 bytes');
  const h = new Uint8Array(HEADER_LENGTH);
  h.set(MAGIC, 0);
  h[4] = 1;
  h[5] = chunkLog2;
  h.set(salt, 8);
  return h;
}

export function parseHeader(h: Uint8Array): { salt: Uint8Array; chunkSize: number } {
  if (h.length < HEADER_LENGTH) throw new AppError('file_corrupted');
  for (let i = 0; i < 4; i++) if (h[i] !== MAGIC[i]) throw new AppError('file_corrupted', { message: 'bad magic' });
  if (h[4] !== 1) throw new AppError('file_corrupted', { message: 'unsupported version' });
  const log2 = h[5]!;
  if (log2 < 10 || log2 > 24) throw new AppError('file_corrupted', { message: 'bad chunk size' });
  return { salt: h.slice(8, 24), chunkSize: 2 ** log2 };
}

export function encryptedSize(plainSize: number, chunkLog2 = DEFAULT_CHUNK_LOG2): number {
  const chunk = 2 ** chunkLog2;
  const chunks = Math.max(1, Math.ceil(plainSize / chunk));
  return HEADER_LENGTH + plainSize + chunks * TAG_LENGTH;
}

export async function encryptStream(params: {
  aead: AeadProvider;
  masterKey: Uint8Array;
  documentId: string;
  salt: Uint8Array;
  source: ByteSource;
  sink: ByteSink;
  chunkLog2?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const chunkLog2 = params.chunkLog2 ?? DEFAULT_CHUNK_LOG2;
  const chunkSize = 2 ** chunkLog2;
  const header = buildHeader(params.salt, chunkLog2);
  const fileKey = deriveFileKey(params.masterKey, params.salt, params.documentId);
  try {
    const key = await params.aead.importKey(fileKey);
    await params.sink.write(header);
    const total = params.source.size;
    const chunks = Math.max(1, Math.ceil(total / chunkSize));
    for (let i = 0; i < chunks; i++) {
      if (params.signal?.aborted) throw new AppError('cancelled');
      const offset = i * chunkSize;
      const len = Math.min(chunkSize, total - offset);
      const plain = len > 0 ? await params.source.read(offset, len) : new Uint8Array(0);
      const sealed = await key.seal(chunkNonce(i, i === chunks - 1), plain, header);
      await params.sink.write(sealed);
      params.onProgress?.(offset + len, total);
    }
  } finally {
    wipe(fileKey);
  }
}

export async function decryptStream(params: {
  aead: AeadProvider;
  masterKey: Uint8Array;
  documentId: string;
  source: ByteSource;
  sink: ByteSink;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { source } = params;
  if (source.size < HEADER_LENGTH + TAG_LENGTH) throw new AppError('file_corrupted', { message: 'too short' });
  const header = await source.read(0, HEADER_LENGTH);
  const { salt, chunkSize } = parseHeader(header);
  const fileKey = deriveFileKey(params.masterKey, salt, params.documentId);
  try {
    const key = await params.aead.importKey(fileKey);
    const body = source.size - HEADER_LENGTH;
    const sealedChunk = chunkSize + TAG_LENGTH;
    const chunks = Math.max(1, Math.ceil(body / sealedChunk));
    for (let i = 0; i < chunks; i++) {
      if (params.signal?.aborted) throw new AppError('cancelled');
      const offset = HEADER_LENGTH + i * sealedChunk;
      const len = Math.min(sealedChunk, source.size - offset);
      if (len < TAG_LENGTH) throw new AppError('file_corrupted', { message: 'truncated chunk' });
      const sealed = await source.read(offset, len);
      let plain: Uint8Array;
      try {
        plain = await key.open(chunkNonce(i, i === chunks - 1), sealed, header);
      } catch (e) {
        throw new AppError('crypto', { cause: e, message: `chunk ${i} failed authentication` });
      }
      await params.sink.write(plain);
      params.onProgress?.(Math.min(body, (i + 1) * sealedChunk), body);
    }
  } finally {
    wipe(fileKey);
  }
}

/** In-memory helpers (small payloads, tests). */
export function memorySource(bytes: Uint8Array): ByteSource {
  return { size: bytes.length, read: async (o, l) => bytes.slice(o, o + l) };
}

export function memorySink(): ByteSink & { bytes(): Uint8Array } {
  const parts: Uint8Array[] = [];
  return {
    write: async (b) => void parts.push(b.slice()),
    bytes: () => concatBytes(...parts),
  };
}
