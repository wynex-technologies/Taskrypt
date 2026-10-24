import { Directory, File, Paths } from 'expo-file-system';

import { isUuid, uuid } from '@/lib/ids';

/**
 * All vault files live in the app sandbox (never shared/external storage):
 *
 *   <documents>/vault/<userId>/offline/<docId>.tkv   encrypted offline copies
 *   <documents>/vault/<userId>/staging/<docId>.tkv   encrypted, waiting to upload
 *   <cache>/taskora-tmp/<random>/<name>              short-lived plaintext for preview/share
 *
 * Paths are built only from validated UUIDs, which rules out path traversal via
 * user-controlled names.
 */

function assertId(id: string) {
  if (!isUuid(id)) throw new Error('invalid id in vault path');
}

export function userVaultDir(userId: string): Directory {
  assertId(userId);
  return new Directory(Paths.document, 'vault', userId);
}

function ensure(dir: Directory): Directory {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function offlineFile(userId: string, docId: string): File {
  assertId(docId);
  return new File(ensure(new Directory(userVaultDir(userId), 'offline')), `${docId}.tkv`);
}

export function stagingFile(userId: string, docId: string): File {
  assertId(docId);
  return new File(ensure(new Directory(userVaultDir(userId), 'staging')), `${docId}.tkv`);
}

export function tempRoot(): Directory {
  return new Directory(Paths.cache, 'taskora-tmp');
}

/** A fresh private temp directory; the display name is sanitized by the caller. */
export function tempFile(name: string): File {
  const dir = ensure(new Directory(tempRoot(), uuid()));
  return new File(dir, name);
}

export function clearTempFiles() {
  try {
    const root = tempRoot();
    if (root.exists) root.delete();
  } catch {
    // best effort
  }
}

export function deleteUserVault(userId: string) {
  try {
    const dir = userVaultDir(userId);
    if (dir.exists) dir.delete();
  } catch {
    // best effort
  }
}

export function fileFromUri(uri: string): File {
  return new File(uri);
}
