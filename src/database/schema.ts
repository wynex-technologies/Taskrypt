import type { Db } from './db';

/**
 * Local SQLite schema. Mirrors the Supabase tables (same column names) plus
 * device-only columns. Migrations are append-only and tracked by PRAGMA user_version.
 */

const SYNC_COLUMNS = `
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  client_updated_at TEXT NOT NULL,
  last_modified_by TEXT NOT NULL,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  sync_state TEXT NOT NULL DEFAULT 'pending'
`;

const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT);

  CREATE TABLE IF NOT EXISTS task_lists (${SYNC_COLUMNS},
    name TEXT NOT NULL, color TEXT NOT NULL, icon TEXT NOT NULL, position REAL NOT NULL DEFAULT 0);

  CREATE TABLE IF NOT EXISTS task_categories (${SYNC_COLUMNS},
    name TEXT NOT NULL, color TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS task_tags (${SYNC_COLUMNS},
    name TEXT NOT NULL, color TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS tasks (${SYNC_COLUMNS},
    list_id TEXT, category_id TEXT,
    title TEXT NOT NULL, description TEXT,
    due_at TEXT, all_day INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'todo', completed_at TEXT,
    recurrence TEXT, recurrence_parent_id TEXT,
    reminder_offset_minutes INTEGER,
    position REAL NOT NULL DEFAULT 0,
    notification_ids TEXT NOT NULL DEFAULT '[]');
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks (due_at) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status, completed_at) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks (list_id) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS task_tag_assignments (${SYNC_COLUMNS},
    task_id TEXT NOT NULL, tag_id TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_tta_task ON task_tag_assignments (task_id);
  CREATE INDEX IF NOT EXISTS idx_tta_tag ON task_tag_assignments (tag_id);

  CREATE TABLE IF NOT EXISTS document_folders (${SYNC_COLUMNS},
    parent_id TEXT, name TEXT NOT NULL, color TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_folders_parent ON document_folders (parent_id);

  CREATE TABLE IF NOT EXISTS documents (${SYNC_COLUMNS},
    folder_id TEXT, name TEXT NOT NULL, storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
    checksum_sha256 TEXT, is_favorite INTEGER NOT NULL DEFAULT 0,
    encryption_mode TEXT NOT NULL DEFAULT 'standard',
    upload_status TEXT NOT NULL DEFAULT 'pending',
    offline_status TEXT NOT NULL DEFAULT 'none',
    offline_path TEXT, offline_size_bytes INTEGER,
    local_staged_path TEXT, last_opened_at TEXT, upload_error TEXT);
  CREATE INDEX IF NOT EXISTS idx_docs_folder ON documents (folder_id);
  CREATE INDEX IF NOT EXISTS idx_docs_name ON documents (name COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS sync_queue (
    op_id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,            -- 'row' | 'upload' | 'copy_object' | 'delete_object'
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    op TEXT NOT NULL,              -- 'upsert' | 'delete' | kind-specific
    payload TEXT NOT NULL,         -- JSON snapshot captured at enqueue time
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'inflight' | 'failed'
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    seq INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_queue_order ON sync_queue (status, seq);
  CREATE INDEX IF NOT EXISTS idx_queue_entity ON sync_queue (entity, entity_id);
  `,
  // v2, v3 — a credential locker that was removed before release; kept as
  // no-op drops so version numbers stay stable on devices that ran them.
  `DROP TABLE IF EXISTS credentials;`,
  `DROP TABLE IF EXISTS credentials;`,
  // v4 — Khata Book: money spent, given and received.
  `
  DROP TABLE IF EXISTS credentials;
  CREATE TABLE IF NOT EXISTS khata_entries (${SYNC_COLUMNS},
    kind TEXT NOT NULL,
    party TEXT,
    description TEXT,
    amount_paise INTEGER NOT NULL,
    entry_date TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_khata_date ON khata_entries (entry_date) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_khata_party ON khata_entries (party COLLATE NOCASE) WHERE deleted_at IS NULL;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  await db.exec('PRAGMA journal_mode = WAL;');
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.transaction(async (tx) => {
      await tx.exec(MIGRATIONS[v]!);
    });
    await db.exec(`PRAGMA user_version = ${v + 1}`);
  }
}
