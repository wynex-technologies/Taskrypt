import type { SqlValue } from '@/database/db';
import type { ChangeTopic } from '@/database/changes';
import type { SyncEntity } from '@/types/domain';

/**
 * Per-entity column metadata. `columns` are exactly the columns that exist on the
 * server and are therefore sent by the sync engine; anything else is device-only.
 */
type EntityConfig = {
  columns: readonly string[];
  booleans: readonly string[];
  json: readonly string[];
  topic: ChangeTopic;
};

const BASE = ['id', 'user_id', 'created_at', 'updated_at', 'client_updated_at', 'last_modified_by', 'deleted_at', 'version'] as const;

export const ENTITY_CONFIG: Record<SyncEntity, EntityConfig> = {
  task_lists: { columns: [...BASE, 'name', 'color', 'icon', 'position'], booleans: [], json: [], topic: 'lists' },
  task_categories: { columns: [...BASE, 'name', 'color'], booleans: [], json: [], topic: 'categories' },
  task_tags: { columns: [...BASE, 'name', 'color'], booleans: [], json: [], topic: 'tags' },
  tasks: {
    columns: [
      ...BASE,
      'list_id',
      'category_id',
      'title',
      'description',
      'due_at',
      'all_day',
      'priority',
      'status',
      'completed_at',
      'recurrence',
      'recurrence_parent_id',
      'reminder_offset_minutes',
      'position',
    ],
    booleans: ['all_day'],
    json: ['recurrence'],
    topic: 'tasks',
  },
  task_tag_assignments: { columns: [...BASE, 'task_id', 'tag_id'], booleans: [], json: [], topic: 'tags' },
  document_folders: { columns: [...BASE, 'parent_id', 'name', 'color'], booleans: [], json: [], topic: 'folders' },
  documents: {
    columns: [
      ...BASE,
      'folder_id',
      'name',
      'storage_key',
      'mime_type',
      'size_bytes',
      'checksum_sha256',
      'is_favorite',
      'encryption_mode',
      'upload_status',
    ],
    booleans: ['is_favorite'],
    json: [],
    topic: 'documents',
  },
  khata_entries: { columns: [...BASE, 'kind', 'party', 'description', 'amount_paise', 'entry_date'], booleans: [], json: [], topic: 'khata' },
};

/** Device-only JSON columns. */
const LOCAL_JSON = new Set(['notification_ids']);

export function isSyncEntity(v: string): v is SyncEntity {
  return Object.prototype.hasOwnProperty.call(ENTITY_CONFIG, v);
}

/** Convert a domain object into SQLite bind values. */
export function encodeRow(entity: SyncEntity, row: Record<string, unknown>): Record<string, SqlValue> {
  const cfg = ENTITY_CONFIG[entity];
  const out: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (cfg.booleans.includes(k)) out[k] = v ? 1 : 0;
    else if (cfg.json.includes(k) || LOCAL_JSON.has(k)) out[k] = v == null ? null : JSON.stringify(v);
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else out[k] = v as SqlValue;
  }
  return out;
}

/** Convert a raw SQLite row into a domain object. */
export function decodeRow<T>(entity: SyncEntity, raw: Record<string, unknown>): T {
  const cfg = ENTITY_CONFIG[entity];
  const out: Record<string, unknown> = { ...raw };
  for (const k of cfg.booleans) if (k in out) out[k] = out[k] === 1 || out[k] === true;
  for (const k of [...cfg.json, ...LOCAL_JSON]) {
    if (typeof out[k] === 'string') {
      try {
        out[k] = JSON.parse(out[k] as string);
      } catch {
        out[k] = null;
      }
    }
  }
  return out as T;
}

/** Only the server columns of a row — what the sync engine is allowed to send. */
export function serverProjection(entity: SyncEntity, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of ENTITY_CONFIG[entity].columns) if (c in row) out[c] = row[c];
  return out;
}

export function buildUpsert(entity: SyncEntity, values: Record<string, SqlValue>): { sql: string; params: SqlValue[] } {
  const cols = Object.keys(values);
  for (const c of cols) if (!/^[a-z][a-z0-9_]*$/.test(c)) throw new Error(`Illegal column ${c}`);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  return {
    sql: `INSERT INTO ${entity} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
    params: cols.map((c) => values[c]!),
  };
}
