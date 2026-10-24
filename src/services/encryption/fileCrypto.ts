import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import { File, FileMode } from 'expo-file-system';

import { AppError } from '@/lib/errors';

import { getAead } from './aead';
import { decryptStream, encryptStream, type ByteSink, type ByteSource } from './vaultFormat';

/** Random-access source over a file using a native handle (no full read into memory). */
export function fileSource(file: File): { source: ByteSource; close: () => void } {
  const handle = file.open(FileMode.ReadOnly);
  const size = handle.size ?? file.size;
  return {
    source: {
      size,
      async read(offset, length) {
        handle.offset = offset;
        return handle.readBytes(length);
      },
    },
    close: () => handle.close(),
  };
}

export function fileSink(file: File): { sink: ByteSink; close: () => void } {
  if (file.exists) file.delete();
  file.create({ intermediates: true });
  const handle = file.open(FileMode.WriteOnly);
  return {
    sink: { write: (bytes) => handle.writeBytes(bytes) },
    close: () => handle.close(),
  };
}

/** Lowercase hex SHA-256 of a file. Native digest when available, streamed JS hash otherwise. */
export async function sha256File(file: File): Promise<string> {
  try {
    const native = await file.digest('SHA-256');
    if (/^[0-9a-f]{64}$/.test(native)) return native;
  } catch {
    // older native module without digest(); fall through
  }
  const hash = sha256.create();
  const handle = file.open(FileMode.ReadOnly);
  try {
    for (;;) {
      const chunk = await handle.readBytes(1 << 20);
      if (chunk.length === 0) break;
      hash.update(chunk);
    }
  } finally {
    handle.close();
  }
  return bytesToHex(hash.digest());
}

type Progress = (done: number, total: number) => void;

export async function encryptFile(input: File, output: File, documentId: string, masterKey: Uint8Array, onProgress?: Progress, signal?: AbortSignal) {
  const aead = await getAead();
  const src = fileSource(input);
  const dst = fileSink(output);
  try {
    await encryptStream({ aead, masterKey, documentId, salt: Crypto.getRandomBytes(16), source: src.source, sink: dst.sink, onProgress, signal });
  } catch (e) {
    dst.close();
    if (output.exists) output.delete();
    throw e;
  } finally {
    src.close();
    try {
      dst.close();
    } catch {
      // already closed
    }
  }
}

/** Decrypt to `output`. On any authentication failure the partial plaintext is deleted. */
export async function decryptFile(input: File, output: File, documentId: string, masterKey: Uint8Array, onProgress?: Progress, signal?: AbortSignal) {
  if (!input.exists) throw new AppError('not_found');
  const aead = await getAead();
  const src = fileSource(input);
  const dst = fileSink(output);
  try {
    await decryptStream({ aead, masterKey, documentId, source: src.source, sink: dst.sink, onProgress, signal });
  } catch (e) {
    dst.close();
    if (output.exists) output.delete();
    throw e;
  } finally {
    src.close();
    try {
      dst.close();
    } catch {
      // already closed
    }
  }
}
