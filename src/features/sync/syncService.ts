import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { getDb, getOpenDbUserId } from '@/database';
import { emitChange, subscribeChanges } from '@/database/changes';
import { onServerDocuments, processVaultJobs } from '@/features/documents/vaultService';
import { toAppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getDeviceId, kvGet } from '@/repositories/kvRepository';
import * as queue from '@/repositories/syncQueueRepository';
import { rescheduleAll } from '@/services/notifications/reminders';
import { isEffectivelyOnline, useNetworkStore } from '@/stores/networkStore';
import { usePreferencesStore } from '@/stores/preferencesStore';

import { supabaseRemote } from './remote';
import { runSync, type SyncReport } from './syncEngine';

const log = createLogger('sync-service');

export type SyncPhase = 'idle' | 'syncing' | 'error' | 'offline';

type SyncState = {
  phase: SyncPhase;
  lastSyncAt: string | null;
  lastError: string | null;
  lastReport: SyncReport | null;
  queue: queue.QueueSummary;
};

export const useSyncStore = create<SyncState>(() => ({
  phase: 'idle',
  lastSyncAt: null,
  lastError: null,
  lastReport: null,
  queue: { pending: 0, failed: 0, uploads: 0, inflight: 0 },
}));

/** Pluggable so the auth layer can react to revoked sessions found during sync. */
let onAuthFailure: (() => void) | null = null;
export function setSyncAuthFailureHandler(fn: (() => void) | null) {
  onAuthFailure = fn;
}

async function refreshSummary() {
  if (!getOpenDbUserId()) return;
  try {
    const db = getDb();
    const [summary, lastSyncAt, lastError] = await Promise.all([queue.summary(db), kvGet(db, 'last_sync_at'), kvGet(db, 'last_sync_error')]);
    useSyncStore.setState({ queue: summary, lastSyncAt, lastError });
  } catch {
    // database closed mid-flight (sign-out)
  }
}

export async function syncNow(reason = 'manual'): Promise<SyncReport | null> {
  if (!getOpenDbUserId()) return null;
  if (!isEffectivelyOnline()) {
    useSyncStore.setState({ phase: 'offline' });
    return null;
  }
  const net = useNetworkStore.getState();
  if (net.isCellular && !usePreferencesStore.getState().autoSyncOnCellular && reason !== 'manual') return null;

  useSyncStore.setState({ phase: 'syncing' });
  try {
    const db = getDb();
    let touchedTasks = false;
    const report = await runSync({
      db,
      remote: supabaseRemote,
      deviceId: await getDeviceId(db),
      hooks: {
        processJobs: processVaultJobs,
        onServerRows: async (entity, rows) => {
          if (entity === 'documents') await onServerDocuments(rows);
          if (entity === 'tasks') touchedTasks = true;
        },
      },
    });
    if (touchedTasks) await rescheduleAll();
    useSyncStore.setState({ phase: 'idle', lastReport: report, lastError: null });
    log.debug('sync complete', { reason, pushed: report.pushed, pulled: report.pulled });
    return report;
  } catch (e) {
    const err = toAppError(e);
    useSyncStore.setState({ phase: err.code === 'network' ? 'offline' : 'error', lastError: err.userMessage });
    if (err.code === 'session_expired' || err.code === 'unauthorized') onAuthFailure?.();
    return null;
  } finally {
    await refreshSummary();
  }
}

let debounce: ReturnType<typeof setTimeout> | null = null;

/** Coalesce bursts of local writes into one background sync. */
export function requestSync(reason: string, delayMs = 1500) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncNow(reason);
  }, delayMs);
}

export async function retryFailedOperations() {
  await queue.retryFailed(getDb());
  emitChange('sync');
  return syncNow('manual');
}

export async function discardFailedOperations() {
  await queue.discardFailed(getDb());
  emitChange('sync');
  await refreshSummary();
}

let stopFns: (() => void)[] = [];

/** Start automatic sync triggers for the signed-in user. */
export function startAutoSync() {
  stopAutoSync();
  void (async () => {
    await queue.resetInflight(getDb());
    await refreshSummary();
    void syncNow('start');
  })();

  const appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void syncNow('foreground');
  });
  let wasOnline = isEffectivelyOnline();
  const netUnsub = useNetworkStore.subscribe((s) => {
    const online = s.isOnline && !s.forcedOffline;
    if (online && !wasOnline) void syncNow('reconnected');
    if (!online) useSyncStore.setState({ phase: 'offline' });
    wasOnline = online;
  });
  const interval = setInterval(() => {
    if (AppState.currentState === 'active') void syncNow('interval');
  }, 5 * 60_000);
  const changeUnsub = subscribeChanges((topics) => {
    if (topics.has('sync')) void refreshSummary();
  });
  stopFns = [() => appSub.remove(), netUnsub, () => clearInterval(interval), changeUnsub];
  log.debug('auto sync started', { platform: Platform.OS });
}

export function stopAutoSync() {
  stopFns.forEach((f) => f());
  stopFns = [];
  if (debounce) clearTimeout(debounce);
  debounce = null;
  useSyncStore.setState({ phase: 'idle', lastSyncAt: null, lastError: null, lastReport: null, queue: { pending: 0, failed: 0, uploads: 0, inflight: 0 } });
}
