import { getDb } from '@/database';
import type { Db } from '@/database/db';
import { emitChange } from '@/database/changes';
import { sanitizeFilename, sanitizeFolderName } from '@/features/documents/fileTypes';
import { AppError } from '@/lib/errors';
import { uuid } from '@/lib/ids';
import { nowIso } from '@/lib/time';
import type { LocalDocument, LocalFolder, OfflineStatus } from '@/types/domain';

import { decodeRow } from './entities';
import { findAll, findById, saveRecord, softDelete } from './entityStore';
import { likePattern } from './taskRepository';

export type DocumentSort = 'name' | 'date' | 'size';
export type DocumentFilter = {
  folderId?: string | null | 'all';
  search?: string;
  mimeTypes?: string[];
  favoritesOnly?: boolean;
  offlineOnly?: boolean;
  sort?: DocumentSort;
  direction?: 'asc' | 'desc';
  limit?: number;
};

const SORTS: Record<DocumentSort, string> = {
  name: 'name COLLATE NOCASE',
  date: 'client_updated_at',
  size: 'size_bytes',
};

export const FOLDER_COLORS = ['#B9502B', '#5E8A6B', '#3F72AF', '#C98F22', '#7B5EA7', '#2F7F7A'];

export const folderRepository = {
  list: (parentId: string | null) =>
    findAll<LocalFolder>(
      'document_folders',
      parentId ? 'deleted_at IS NULL AND parent_id = ?' : 'deleted_at IS NULL AND parent_id IS NULL',
      parentId ? [parentId] : [],
      'name COLLATE NOCASE',
    ),

  all: () => findAll<LocalFolder>('document_folders', 'deleted_at IS NULL', [], 'name COLLATE NOCASE'),

  get: (id: string) => findById<LocalFolder>('document_folders', id),

  /** Root → folder breadcrumb trail. */
  async path(id: string | null): Promise<LocalFolder[]> {
    const trail: LocalFolder[] = [];
    let cursor = id;
    for (let i = 0; cursor && i < 32; i++) {
      const f = await findById<LocalFolder>('document_folders', cursor);
      if (!f || f.deleted_at) break;
      trail.unshift(f);
      cursor = f.parent_id;
    }
    return trail;
  },

  async create(name: string, parentId: string | null, color = FOLDER_COLORS[0]!): Promise<LocalFolder> {
    return saveRecord<LocalFolder>('document_folders', uuid(), { name: sanitizeFolderName(name), parent_id: parentId, color });
  },

  rename: (id: string, name: string) => saveRecord<LocalFolder>('document_folders', id, { name: sanitizeFolderName(name) }),

  async move(id: string, newParentId: string | null): Promise<LocalFolder> {
    if (newParentId) {
      const descendants = await folderRepository.descendantIds(id);
      if (newParentId === id || descendants.includes(newParentId))
        throw new AppError('validation', { userMessage: 'A folder cannot be moved inside itself.' });
    }
    return saveRecord<LocalFolder>('document_folders', id, { parent_id: newParentId });
  },

  async descendantIds(id: string, db: Db = getDb()): Promise<string[]> {
    const rows = await db.all<{ id: string }>(
      `WITH RECURSIVE tree(id, depth) AS (
         SELECT id, 0 FROM document_folders WHERE parent_id = ? AND deleted_at IS NULL
         UNION ALL
         SELECT f.id, t.depth + 1 FROM document_folders f JOIN tree t ON f.parent_id = t.id
         WHERE f.deleted_at IS NULL AND t.depth < 32
       ) SELECT id FROM tree`,
      [id],
    );
    return rows.map((r) => r.id);
  },

  /** Delete a folder, its sub-folders and every document inside them. Returns removed documents. */
  async remove(id: string): Promise<LocalDocument[]> {
    const db = getDb();
    const removed: LocalDocument[] = [];
    await db.transaction(async (tx) => {
      const ids = [id, ...(await folderRepository.descendantIds(id, tx))];
      const docs = await tx.all<Record<string, unknown>>(
        `SELECT * FROM documents WHERE deleted_at IS NULL AND folder_id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
      for (const raw of docs) {
        const d = decodeRow<LocalDocument>('documents', raw);
        removed.push(d);
        await softDelete('documents', d.id, tx);
      }
      // Children first so no live folder ever points at a deleted parent.
      for (const fid of ids.reverse()) await softDelete('document_folders', fid, tx);
    });
    emitChange('folders', 'documents', 'sync');
    return removed;
  },

  async counts(): Promise<Map<string, number>> {
    const rows = await getDb().all<{ folder_id: string; n: number }>(
      'SELECT folder_id, COUNT(*) AS n FROM documents WHERE deleted_at IS NULL AND folder_id IS NOT NULL GROUP BY folder_id',
    );
    return new Map(rows.map((r) => [r.folder_id, r.n]));
  },
};

export const documentRepository = {
  async list(filter: DocumentFilter = {}): Promise<LocalDocument[]> {
    const where = ['deleted_at IS NULL'];
    const params: (string | number)[] = [];
    if (filter.folderId !== undefined && filter.folderId !== 'all') {
      if (filter.folderId === null) where.push('folder_id IS NULL');
      else {
        where.push('folder_id = ?');
        params.push(filter.folderId);
      }
    }
    if (filter.search?.trim()) {
      where.push("name LIKE ? ESCAPE '\\'");
      params.push(likePattern(filter.search.trim()));
    }
    if (filter.mimeTypes?.length) {
      where.push(`mime_type IN (${filter.mimeTypes.map(() => '?').join(',')})`);
      params.push(...filter.mimeTypes);
    }
    if (filter.favoritesOnly) where.push('is_favorite = 1');
    if (filter.offlineOnly) where.push("offline_status = 'available'");
    const dir = filter.direction ?? (filter.sort === 'name' ? 'asc' : 'desc');
    const order = `${SORTS[filter.sort ?? 'date']} ${dir === 'asc' ? 'ASC' : 'DESC'}`;
    const limit = filter.limit ? ` LIMIT ${Math.max(1, Math.min(1000, Math.floor(filter.limit)))}` : '';
    const rows = await getDb().all<Record<string, unknown>>(`SELECT * FROM documents WHERE ${where.join(' AND ')} ORDER BY ${order}${limit}`, params);
    return rows.map((r) => decodeRow<LocalDocument>('documents', r));
  },

  recent: (limit = 8) =>
    findAll<LocalDocument>('documents', 'deleted_at IS NULL', [], 'COALESCE(last_opened_at, client_updated_at) DESC LIMIT ' + Math.floor(limit)),

  get: async (id: string) => {
    const d = await findById<LocalDocument>('documents', id);
    return d && !d.deleted_at ? d : null;
  },

  /** Create the metadata row for a newly imported file. Not synced until its binary is uploaded. */
  async createLocal(params: {
    id: string;
    userId: string;
    name: string;
    mime: string;
    size: number;
    checksum: string | null;
    folderId: string | null;
    storageKey: string;
    encryptionMode: 'standard' | 'e2ee';
    stagedPath: string | null;
    deviceId: string;
  }): Promise<void> {
    const now = nowIso();
    await getDb().run(
      `INSERT INTO documents (id, user_id, created_at, updated_at, client_updated_at, last_modified_by, deleted_at, version, sync_state,
        folder_id, name, storage_key, mime_type, size_bytes, checksum_sha256, is_favorite, encryption_mode, upload_status,
        offline_status, offline_path, offline_size_bytes, local_staged_path, last_opened_at, upload_error)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 'pending', ?, ?, ?, ?, ?, ?, 0, ?, 'pending', 'none', NULL, NULL, ?, NULL, NULL)`,
      [
        params.id,
        params.userId,
        now,
        now,
        now,
        params.deviceId,
        params.folderId,
        sanitizeFilename(params.name),
        params.storageKey,
        params.mime,
        params.size,
        params.checksum,
        params.encryptionMode,
        params.stagedPath,
      ],
    );
    emitChange('documents');
  },

  rename: (id: string, name: string) => saveRecord<LocalDocument>('documents', id, { name: sanitizeFilename(name) }),
  move: (id: string, folderId: string | null) => saveRecord<LocalDocument>('documents', id, { folder_id: folderId }),
  setFavorite: (id: string, fav: boolean) => saveRecord<LocalDocument>('documents', id, { is_favorite: fav }),

  /** Mark uploaded and enqueue the metadata row for sync. */
  markUploaded: (id: string, tx?: Db) =>
    saveRecord<LocalDocument>('documents', id, { upload_status: 'uploaded' }, { tx, localExtras: { upload_error: null, local_staged_path: null } }),

  async setUploadState(id: string, status: 'pending' | 'uploading' | 'failed', error: string | null = null) {
    await getDb().run('UPDATE documents SET upload_status = ?, upload_error = ? WHERE id = ?', [status, error, id]);
    emitChange('documents');
  },

  async setOffline(id: string, status: OfflineStatus, path: string | null = null, size: number | null = null) {
    await getDb().run('UPDATE documents SET offline_status = ?, offline_path = ?, offline_size_bytes = ? WHERE id = ?', [status, path, size, id]);
    emitChange('documents');
  },

  async touchOpened(id: string) {
    await getDb().run('UPDATE documents SET last_opened_at = ? WHERE id = ?', [nowIso(), id]);
    emitChange('documents');
  },

  remove: async (id: string) => {
    const doc = await findById<LocalDocument>('documents', id);
    if (!doc) return null;
    if (doc.upload_status !== 'uploaded' && doc.version === 0) {
      // Never reached the server: drop it locally and cancel its queued upload.
      await getDb().transaction(async (tx) => {
        await tx.run('DELETE FROM sync_queue WHERE entity = ? AND entity_id = ?', ['documents', id]);
        await tx.run('DELETE FROM documents WHERE id = ?', [id]);
      });
      emitChange('documents', 'sync');
      return doc;
    }
    await softDelete('documents', id);
    return doc;
  },

  async usage(): Promise<{ count: number; bytes: number; offlineBytes: number; offlineCount: number; byKind: { mime: string; bytes: number; n: number }[] }> {
    const db = getDb();
    const total = await db.first<{ n: number; b: number | null; ob: number | null; on: number }>(
      `SELECT COUNT(*) AS n, SUM(size_bytes) AS b,
              SUM(CASE WHEN offline_status = 'available' THEN COALESCE(offline_size_bytes, size_bytes) ELSE 0 END) AS ob,
              SUM(CASE WHEN offline_status = 'available' THEN 1 ELSE 0 END) AS "on"
       FROM documents WHERE deleted_at IS NULL`,
    );
    const byKind = await db.all<{ mime: string; bytes: number; n: number }>(
      'SELECT mime_type AS mime, SUM(size_bytes) AS bytes, COUNT(*) AS n FROM documents WHERE deleted_at IS NULL GROUP BY mime_type ORDER BY bytes DESC',
    );
    return { count: total?.n ?? 0, bytes: total?.b ?? 0, offlineBytes: total?.ob ?? 0, offlineCount: total?.on ?? 0, byKind };
  },
};
