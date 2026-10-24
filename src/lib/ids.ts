import { sha1 } from '@noble/hashes/legacy.js';
import * as Crypto from 'expo-crypto';

import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from './bytes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Random RFC 4122 v4 UUID from the platform CSPRNG. */
export function uuid(): string {
  return Crypto.randomUUID().toLowerCase();
}

/** Namespace for Taskrypt's deterministic identifiers. */
export const TASKORA_NAMESPACE = '6f0c3a52-8a1e-4d8b-9b9e-1f4b2c7d9e10';

/**
 * RFC 4122 v5 (name-based, SHA-1) UUID. Used where two devices must independently
 * produce the SAME id for the same logical record — e.g. the next occurrence of a
 * recurring task, or a task↔tag assignment — so concurrent creation cannot duplicate.
 */
export function uuidV5(name: string, namespace: string = TASKORA_NAMESPACE): string {
  const ns = hexToBytes(namespace.replace(/-/g, ''));
  const hash = sha1(concatBytes(ns, utf8ToBytes(name)));
  const b = hash.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
