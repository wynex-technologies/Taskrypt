/**
 * Table-level change notifications. Repositories emit after every committed
 * write; React Query hooks listen and invalidate the matching query keys, so the
 * UI always renders straight from SQLite (the offline source of truth).
 */
export type ChangeTopic = 'tasks' | 'lists' | 'tags' | 'categories' | 'documents' | 'folders' | 'sync';

type Listener = (topics: ReadonlySet<ChangeTopic>) => void;

const listeners = new Set<Listener>();
let pending = new Set<ChangeTopic>();
let scheduled = false;

export function emitChange(...topics: ChangeTopic[]) {
  topics.forEach((t) => pending.add(t));
  if (scheduled) return;
  scheduled = true;
  // Coalesce bursts (a sync pull touching 500 rows) into one notification.
  queueMicrotask(() => {
    const batch = pending;
    pending = new Set();
    scheduled = false;
    listeners.forEach((l) => l(batch));
  });
}

export function subscribeChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
