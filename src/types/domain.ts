/**
 * Domain model shared by SQLite, the sync engine and the Supabase schema.
 * Column names are snake_case on purpose: rows travel unchanged between the
 * local database and PostgREST, which removes a whole class of mapping bugs.
 */

export type Priority = 0 | 1 | 2 | 3;
export const PRIORITY_LABELS = ['Low', 'Medium', 'High', 'Urgent'] as const;
export const PRIORITY_KEYS = ['low', 'medium', 'high', 'urgent'] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export type TaskStatus = 'todo' | 'done';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

export type RecurrenceRule = {
  freq: RecurrenceFrequency;
  /** Every N units. For 'custom' the unit is `unit`. */
  interval: number;
  /** 0 = Sunday … 6 = Saturday. Only used for weekly rules. */
  weekdays?: number[];
  unit?: 'day' | 'week' | 'month';
  /** Optional ISO end date after which no occurrences are produced. */
  until?: string | null;
};

/** Fields every synchronized row carries. */
export type SyncedRow = {
  id: string;
  user_id: string;
  created_at: string;
  /** Server-assigned, monotonic per row; the pull cursor. */
  updated_at: string;
  /** When the change was made on the device that made it; the conflict clock. */
  client_updated_at: string;
  /** Device that produced the winning version; deterministic tie-breaker. */
  last_modified_by: string;
  /** Tombstone. Deletes are soft so they can propagate to other devices. */
  deleted_at: string | null;
  version: number;
};

export type TaskList = SyncedRow & {
  name: string;
  color: string;
  icon: string;
  position: number;
};

export type TaskCategory = SyncedRow & {
  name: string;
  color: string;
};

export type TaskTag = SyncedRow & {
  name: string;
  color: string;
};

export type Task = SyncedRow & {
  list_id: string | null;
  category_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  all_day: boolean;
  priority: Priority;
  status: TaskStatus;
  completed_at: string | null;
  recurrence: RecurrenceRule | null;
  recurrence_parent_id: string | null;
  reminder_offset_minutes: number | null;
  position: number;
};

export type TaskTagAssignment = SyncedRow & {
  task_id: string;
  tag_id: string;
};

export type DocumentFolder = SyncedRow & {
  parent_id: string | null;
  name: string;
  color: string;
};

export type EncryptionMode = 'standard' | 'e2ee';
export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export type VaultDocument = SyncedRow & {
  folder_id: string | null;
  name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256: string | null;
  is_favorite: boolean;
  encryption_mode: EncryptionMode;
  upload_status: UploadStatus;
};

/** Local-only columns that never leave the device. */
export type LocalSyncState = 'synced' | 'pending' | 'failed';
export type OfflineStatus = 'none' | 'downloading' | 'available' | 'error';

export type LocalTask = Task & { sync_state: LocalSyncState; notification_ids: string[] };
export type LocalDocument = VaultDocument & {
  sync_state: LocalSyncState;
  offline_status: OfflineStatus;
  offline_path: string | null;
  offline_size_bytes: number | null;
  local_staged_path: string | null;
  last_opened_at: string | null;
  upload_error: string | null;
};
export type LocalFolder = DocumentFolder & { sync_state: LocalSyncState };

/** Khata Book entry. `bought`: money spent on something; `gave`: paid to someone; `got`: received from someone. */
export type KhataKind = 'bought' | 'gave' | 'got';
export type KhataEntry = SyncedRow & {
  kind: KhataKind;
  /** Person or shop. Required for gave / got. */
  party: string | null;
  /** What was bought, or what the money was for. Required for bought. */
  description: string | null;
  /** Whole paise, so sums never drift. */
  amount_paise: number;
  /** Local calendar day, YYYY-MM-DD. */
  entry_date: string;
};
export type LocalKhataEntry = KhataEntry & { sync_state: LocalSyncState };

export type SyncEntity =
  | 'task_lists'
  | 'task_categories'
  | 'task_tags'
  | 'tasks'
  | 'task_tag_assignments'
  | 'document_folders'
  | 'documents'
  | 'khata_entries';

/** Order matters: parents before children so foreign keys resolve on the server. */
export const SYNC_ENTITIES: readonly SyncEntity[] = [
  'task_lists',
  'task_categories',
  'task_tags',
  'tasks',
  'task_tag_assignments',
  'document_folders',
  'documents',
  'khata_entries',
] as const;

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_color: string;
  daily_goal: number;
  timezone: string | null;
  e2ee_enabled: boolean;
  e2ee_salt: string | null;
  e2ee_wrapped_key: string | null;
  e2ee_kdf: string | null;
  storage_quota_bytes: number;
  created_at: string;
  updated_at: string;
};
