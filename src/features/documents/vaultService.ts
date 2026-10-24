import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, UploadType, type UploadTask } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { getDb, getOpenDbUserId } from '@/database';
import type { Db } from '@/database/db';
import { emitChange } from '@/database/changes';
import { env } from '@/lib/env';
import { AppError, toAppError } from '@/lib/errors';
import { uuid } from '@/lib/ids';
import { createLogger } from '@/lib/logger';
import { documentRepository } from '@/repositories/documentRepository';
import { decodeRow } from '@/repositories/entities';
import { findById } from '@/repositories/entityStore';
import { getDeviceId } from '@/repositories/kvRepository';
import * as queue from '@/repositories/syncQueueRepository';
import { decryptFile, encryptFile, sha256File } from '@/services/encryption/fileCrypto';
import { getE2eeKey, getOrCreateVaultKey } from '@/services/encryption/keyManager';
import { getSupabase } from '@/services/supabase/client';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTransferStore } from '@/stores/transferStore';
import type { LocalDocument } from '@/types/domain';

import { PICKER_MIME_TYPES, validateFile, type ValidatedFile } from './fileTypes';
import { clearTempFiles, offlineFile, stagingFile, tempFile } from './vaultPaths';

const log = createLogger('vault');

function requireUser(): string {
  const id = getOpenDbUserId();
  if (!id) throw new AppError('unauthorized');
  return id;
}

export function newStorageKey(userId: string, docId: string): string {
  return `${userId}/${docId}/${uuid()}`;
}

const progress = (id: string, kind: 'encrypting' | 'uploading' | 'downloading' | 'decrypting') => (done: number, total: number) =>
  useTransferStore.getState().set(id, { kind, fraction: total > 0 ? Math.min(1, done / total) : 1 });

function readHead(file: File, length = 4096): Uint8Array {
  const handle = file.open(FileMode.ReadOnly);
  try {
    return handle.readBytesSync(Math.min(length, file.size || length));
  } finally {
    handle.close();
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportResult = { imported: LocalDocument[]; rejected: { name: string; reason: string }[]; cancelled: boolean };

async function importFile(source: File, originalName: string, folderId: string | null): Promise<LocalDocument> {
  const userId = requireUser();
  const db = getDb();
  const validated: ValidatedFile = validateFile({
    name: originalName,
    size: source.size,
    head: readHead(source),
    maxBytes: env.maxUploadBytes,
  });
  const docId = uuid();
  const checksum = await sha256File(source);
  const key = await getOrCreateVaultKey(userId);
  const staged = stagingFile(userId, docId);
  await encryptFile(source, staged, docId, key, progress(docId, 'encrypting'));
  useTransferStore.getState().clear(docId);

  const prefs = usePreferencesStore.getState();
  const e2ee = prefs.e2eeEnabled && (await getE2eeKey(userId)) !== null;
  await documentRepository.createLocal({
    id: docId,
    userId,
    name: validated.name,
    mime: validated.mime,
    size: source.size,
    checksum,
    folderId,
    storageKey: newStorageKey(userId, docId),
    encryptionMode: e2ee ? 'e2ee' : 'standard',
    stagedPath: staged.uri,
    deviceId: await getDeviceId(db),
  });
  await db.transaction((tx) => queue.enqueueJob(tx, 'upload', 'documents', docId, {}).then(() => undefined));
  emitChange('documents', 'sync');
  const doc = await documentRepository.get(docId);
  if (!doc) throw new AppError('unknown');
  return doc;
}

/**
 * Pick one or more files with the native picker and stage them (encrypted) for upload.
 *
 * Android: the picker's own cache copy lands in the app-wide cache, which Expo Go's
 * per-project sandbox refuses to read ("Missing 'READ' permission"). So we take the
 * content:// URI and copy it into our private temp directory ourselves — that works
 * in Expo Go and in real builds alike, and never touches the user's original file.
 */
export async function pickAndImport(folderId: string | null): Promise<ImportResult> {
  requireUser();
  const pickerCopies = Platform.OS !== 'android';
  const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: pickerCopies, type: PICKER_MIME_TYPES });
  if (result.canceled) return { imported: [], rejected: [], cancelled: true };
  const imported: LocalDocument[] = [];
  const rejected: ImportResult['rejected'] = [];
  for (const asset of result.assets) {
    const picked = new File(asset.uri);
    const local = tempFile('import.bin');
    try {
      await picked.copy(local);
      imported.push(await importFile(local, asset.name, folderId));
    } catch (e) {
      log.warn('import failed', { detail: e instanceof Error ? e.message : String(e) });
      rejected.push({ name: asset.name, reason: toAppError(e).userMessage });
    } finally {
      try {
        if (local.parentDirectory.exists) local.parentDirectory.delete();
        // Only delete the picker's cache copy — never a content:// original.
        if (pickerCopies && picked.exists) picked.delete();
      } catch {
        // temp files are also purged at start and sign-out
      }
    }
  }
  return { imported, rejected, cancelled: false };
}

// ---------------------------------------------------------------------------
// Binary jobs (run by the sync engine while online)
// ---------------------------------------------------------------------------

const activeUploads = new Map<string, UploadTask>();
const cancelled = new Set<string>();

function objectUrl(key: string) {
  return `${env.supabaseUrl}/storage/v1/object/${env.documentBucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function accessToken(): Promise<string> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new AppError('session_expired', { cause: error });
  return data.session.access_token;
}

/** Storage answers `{ statusCode, error, message }`; the HTTP status is often a generic 400. */
function storageError(httpStatus: number, body: string): AppError {
  let detail = body.slice(0, 200);
  let status = httpStatus;
  try {
    const parsed = JSON.parse(body) as { statusCode?: string | number; error?: string; message?: string };
    detail = [parsed.error, parsed.message].filter(Boolean).join(': ') || detail;
    const code = Number(parsed.statusCode);
    if (Number.isFinite(code) && code >= 400) status = code;
  } catch {
    // non-JSON body
  }
  return toAppError({ status, message: `storage ${httpStatus}: ${detail}` });
}

async function uploadJob(db: Db, job: queue.QueueItem): Promise<void> {
  const userId = requireUser();
  const raw = await db.first<Record<string, unknown>>('SELECT * FROM documents WHERE id = ?', [job.entity_id]);
  const doc = raw ? decodeRow<LocalDocument>('documents', raw) : null;
  if (!doc || doc.deleted_at) {
    await queue.complete(db, [job.op_id]);
    return;
  }
  if (!doc.local_staged_path) throw new AppError('not_found', { message: 'staged file missing', retryable: false });
  const staged = new File(doc.local_staged_path);
  if (!staged.exists) throw new AppError('not_found', { message: 'staged file missing', retryable: false });

  await documentRepository.setUploadState(doc.id, 'uploading');
  const key = await getOrCreateVaultKey(userId);
  const plain = tempFile('upload.bin');
  let body = plain;
  try {
    await decryptFile(staged, plain, doc.id, key);
    // Integrity: what we upload must be exactly what the user picked.
    if (doc.checksum_sha256 && (await sha256File(plain)) !== doc.checksum_sha256) throw new AppError('file_corrupted', { retryable: false });

    let contentType = doc.mime_type;
    if (doc.encryption_mode === 'e2ee') {
      const dek = await getE2eeKey(userId);
      if (!dek) throw new AppError('crypto', { userMessage: 'Unlock your vault passphrase to upload end-to-end encrypted files.', retryable: false });
      body = tempFile('upload.tkv');
      await encryptFile(plain, body, doc.id, dek);
      contentType = 'application/octet-stream';
    }

    const task = body.createUploadTask(objectUrl(doc.storage_key), {
      httpMethod: 'POST',
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: contentType,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        apikey: env.supabaseAnonKey!,
        'Content-Type': contentType,
        'x-upsert': 'false',
        'cache-control': 'max-age=0, private',
      },
    });
    activeUploads.set(doc.id, task);
    task.addListener('progress', (p) => progress(doc.id, 'uploading')(p.bytesSent, p.totalBytes));
    const res = await task.uploadAsync();
    if (cancelled.has(doc.id)) throw new AppError('cancelled');
    const duplicate = (res.status === 400 || res.status === 409) && /duplicate|already exists/i.test(res.body);
    if (res.status >= 300 && !duplicate) {
      throw storageError(res.status, res.body);
    }

    // The staged ciphertext is already a valid offline copy for this document.
    const offline = offlineFile(userId, doc.id);
    if (offline.exists) offline.delete();
    staged.move(offline);
    await db.transaction(async (tx) => {
      await documentRepository.markUploaded(doc.id, tx);
      await tx.run("UPDATE documents SET offline_status = 'available', offline_path = ?, offline_size_bytes = ? WHERE id = ?", [
        offline.uri,
        offline.size,
        doc.id,
      ]);
      await queue.complete(tx, [job.op_id]);
    });
    emitChange('documents', 'sync');
  } finally {
    activeUploads.delete(doc.id);
    useTransferStore.getState().clear(doc.id);
    for (const f of [plain, body]) {
      try {
        if (f.exists) f.parentDirectory.delete();
      } catch {
        // best effort
      }
    }
  }
}

async function copyJob(db: Db, job: queue.QueueItem): Promise<void> {
  const from = String(job.payload.from);
  const doc = await findById<LocalDocument>('documents', job.entity_id, db);
  if (!doc || doc.deleted_at) return queue.complete(db, [job.op_id]);
  const { error } = await getSupabase().storage.from(env.documentBucket).copy(from, doc.storage_key);
  if (error && !/exists|duplicate/i.test(error.message)) throw toAppError(error);
  await db.transaction(async (tx) => {
    await documentRepository.markUploaded(doc.id, tx);
    await queue.complete(tx, [job.op_id]);
  });
}

async function deleteObjectJob(db: Db, job: queue.QueueItem): Promise<void> {
  // Wait until the tombstone itself reached the server.
  if (await queue.hasPendingFor(db, 'documents', job.entity_id)) return;
  const key = String(job.payload.storage_key);
  const { error } = await getSupabase().storage.from(env.documentBucket).remove([key]);
  if (error && !/not found/i.test(error.message)) throw toAppError(error);
  await queue.complete(db, [job.op_id]);
}

export async function processVaultJobs(db: Db): Promise<void> {
  await queue.resetInflight(db);
  const jobs = await queue.listReady(db, ['upload', 'copy_object', 'delete_object'], 50);
  for (const job of jobs) {
    cancelled.delete(job.entity_id);
    try {
      if (job.kind === 'upload') await uploadJob(db, job);
      else if (job.kind === 'copy_object') await copyJob(db, job);
      else if (job.kind === 'delete_object') await deleteObjectJob(db, job);
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'cancelled') {
        await queue.complete(db, [job.op_id]);
        await documentRepository.setUploadState(job.entity_id, 'failed', 'Upload cancelled');
        continue;
      }
      log.warn('vault job failed', { kind: job.kind, code: err.code, detail: err.message });
      await queue.fail(db, job.op_id, err.userMessage, err.retryable);
      if (job.kind === 'upload') await documentRepository.setUploadState(job.entity_id, err.retryable ? 'pending' : 'failed', err.userMessage);
      if (err.code === 'session_expired' || err.code === 'network') throw err;
    }
  }
}

export function cancelUpload(docId: string) {
  cancelled.add(docId);
  activeUploads.get(docId)?.cancel();
  // If not started yet, remove the job so it does not start.
  void (async () => {
    const db = getDb();
    await db.run("DELETE FROM sync_queue WHERE kind = 'upload' AND entity_id = ? AND status != 'inflight'", [docId]);
    await documentRepository.setUploadState(docId, 'failed', 'Upload cancelled');
    emitChange('sync');
  })();
}

export async function retryUpload(docId: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.run("UPDATE documents SET upload_status = 'pending', upload_error = NULL WHERE id = ?", [docId]);
    await queue.enqueueJob(tx, 'upload', 'documents', docId, {});
  });
  emitChange('documents', 'sync');
}

// ---------------------------------------------------------------------------
// Offline copies, preview, share
// ---------------------------------------------------------------------------

async function signedUrl(key: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from(env.documentBucket).createSignedUrl(key, 60);
  if (error || !data?.signedUrl) throw toAppError(error ?? new Error('no signed url'));
  return data.signedUrl;
}

/** Download the remote object to a private temp file and return plaintext. */
async function downloadPlaintext(doc: LocalDocument): Promise<File> {
  const userId = requireUser();
  const url = await signedUrl(doc.storage_key);
  const target = tempFile(doc.encryption_mode === 'e2ee' ? 'download.tkv' : 'download.bin');
  useTransferStore.getState().set(doc.id, { kind: 'downloading', fraction: 0 });
  const downloaded = await File.downloadFileAsync(url, target, {
    idempotent: true,
    onProgress: (p) => progress(doc.id, 'downloading')(p.bytesWritten, p.totalBytes),
  });
  if (doc.encryption_mode !== 'e2ee') return downloaded;
  const dek = await getE2eeKey(userId);
  if (!dek) throw new AppError('crypto', { userMessage: 'Unlock your vault passphrase to open end-to-end encrypted files.' });
  const plain = tempFile('download.bin');
  await decryptFile(downloaded, plain, doc.id, dek, progress(doc.id, 'decrypting'));
  downloaded.parentDirectory.delete();
  return plain;
}

async function verifyChecksum(file: File, doc: LocalDocument) {
  if (!doc.checksum_sha256) return;
  if ((await sha256File(file)) !== doc.checksum_sha256) {
    file.parentDirectory.delete();
    throw new AppError('file_corrupted');
  }
}

export async function makeAvailableOffline(doc: LocalDocument): Promise<void> {
  const userId = requireUser();
  if (doc.offline_status === 'available') return;
  await documentRepository.setOffline(doc.id, 'downloading');
  try {
    const plain = await downloadPlaintext(doc);
    await verifyChecksum(plain, doc);
    const out = offlineFile(userId, doc.id);
    await encryptFile(plain, out, doc.id, await getOrCreateVaultKey(userId), progress(doc.id, 'encrypting'));
    plain.parentDirectory.delete();
    await documentRepository.setOffline(doc.id, 'available', out.uri, out.size);
  } catch (e) {
    await documentRepository.setOffline(doc.id, 'error');
    throw toAppError(e);
  } finally {
    useTransferStore.getState().clear(doc.id);
  }
}

export async function removeOfflineCopy(doc: LocalDocument): Promise<void> {
  const userId = requireUser();
  const f = offlineFile(userId, doc.id);
  if (f.exists) f.delete();
  await documentRepository.setOffline(doc.id, 'none');
}

/**
 * Produce a temporary plaintext copy for viewing/sharing. Callers MUST call
 * `release()` when done; stale temp files are also purged at start and sign-out.
 */
export async function openPlaintext(doc: LocalDocument, displayName = doc.name): Promise<{ file: File; release: () => void }> {
  const userId = requireUser();
  const encryptedLocal = doc.offline_status === 'available' ? offlineFile(userId, doc.id) : doc.local_staged_path ? new File(doc.local_staged_path) : null;
  let file: File;
  if (encryptedLocal?.exists) {
    file = tempFile(displayName);
    await decryptFile(encryptedLocal, file, doc.id, await getOrCreateVaultKey(userId), progress(doc.id, 'decrypting'));
  } else {
    const downloaded = await downloadPlaintext(doc);
    await verifyChecksum(downloaded, doc);
    file = tempFile(displayName);
    downloaded.move(file);
  }
  useTransferStore.getState().clear(doc.id);
  await documentRepository.touchOpened(doc.id);
  return {
    file,
    release: () => {
      try {
        if (file.exists) file.parentDirectory.delete();
      } catch {
        // best effort
      }
    },
  };
}

export async function previewDocument(doc: LocalDocument): Promise<{ release: () => void } | null> {
  const opened = await openPlaintext(doc);
  if (await opened.file.canPreview({ mimeType: doc.mime_type })) {
    await opened.file.preview({ title: doc.name, mimeType: doc.mime_type });
    return opened;
  }
  return shareFile(opened, doc);
}

async function shareFile(opened: { file: File; release: () => void }, doc: LocalDocument) {
  if (!(await Sharing.isAvailableAsync())) {
    opened.release();
    throw new AppError('unknown', { userMessage: 'Sharing is not available on this device.' });
  }
  await Sharing.shareAsync(opened.file.uri, { mimeType: doc.mime_type, dialogTitle: doc.name, UTI: undefined });
  return opened;
}

export async function shareDocument(doc: LocalDocument) {
  const opened = await openPlaintext(doc);
  try {
    await shareFile(opened, doc);
  } finally {
    // The share sheet has finished reading the file once shareAsync resolves.
    opened.release();
  }
}

// ---------------------------------------------------------------------------
// Delete / copy
// ---------------------------------------------------------------------------

export async function deleteDocuments(docs: LocalDocument[]): Promise<void> {
  const userId = requireUser();
  const db = getDb();
  for (const doc of docs) {
    cancelUploadIfActive(doc.id);
    const removed = doc.deleted_at ? doc : await documentRepository.remove(doc.id);
    for (const f of [offlineFile(userId, doc.id), doc.local_staged_path ? new File(doc.local_staged_path) : null]) {
      try {
        if (f?.exists) f.delete();
      } catch {
        // best effort
      }
    }
    if (removed && removed.upload_status === 'uploaded') {
      await db.transaction((tx) => queue.enqueueJob(tx, 'delete_object', 'documents', doc.id, { storage_key: removed.storage_key }).then(() => undefined));
    }
  }
  emitChange('documents', 'sync');
}

function cancelUploadIfActive(docId: string) {
  if (activeUploads.has(docId)) {
    cancelled.add(docId);
    activeUploads.get(docId)?.cancel();
  }
}

export async function copyDocument(doc: LocalDocument, folderId: string | null): Promise<void> {
  const userId = requireUser();
  if (doc.upload_status !== 'uploaded') throw new AppError('validation', { userMessage: 'Wait for the upload to finish before copying.' });
  const db = getDb();
  const id = uuid();
  const ext = doc.name.includes('.') ? doc.name.slice(doc.name.lastIndexOf('.')) : '';
  const base = ext ? doc.name.slice(0, -ext.length) : doc.name;
  await documentRepository.createLocal({
    id,
    userId,
    name: `${base} copy${ext}`,
    mime: doc.mime_type,
    size: doc.size_bytes,
    checksum: doc.checksum_sha256,
    folderId,
    storageKey: newStorageKey(userId, id),
    encryptionMode: doc.encryption_mode,
    stagedPath: null,
    deviceId: await getDeviceId(db),
  });
  await db.transaction((tx) => queue.enqueueJob(tx, 'copy_object', 'documents', id, { from: doc.storage_key }).then(() => undefined));
  emitChange('documents', 'sync');
}

/**
 * React to server-side changes: a document deleted on another device loses its
 * local encrypted copies here too.
 */
export async function onServerDocuments(rows: Record<string, unknown>[]): Promise<void> {
  const userId = getOpenDbUserId();
  if (!userId) return;
  for (const row of rows) {
    if (!row.deleted_at) continue;
    const id = String(row.id);
    const f = offlineFile(userId, id);
    if (f.exists) f.delete();
    await getDb().run("UPDATE documents SET offline_status = 'none', offline_path = NULL WHERE id = ?", [id]);
  }
}

export function purgeTemporaryFiles() {
  clearTempFiles();
}
