import { closeDatabase, wipeUserDatabase } from '@/database';
import { clearTempFiles, deleteUserVault } from '@/features/documents/vaultPaths';
import { stopAutoSync } from '@/features/sync/syncService';
import { createLogger } from '@/lib/logger';
import { resetDeviceIdCache } from '@/repositories/kvRepository';
import { clearKeyCache, destroyKeys } from '@/services/encryption/keyManager';
import { cancelAllReminders } from '@/services/notifications/reminders';
import { queryClient } from '@/services/queryClient';
import { usePreferencesStore, type LogoutPolicy } from '@/stores/preferencesStore';
import { useTransferStore } from '@/stores/transferStore';

import { clearGrant } from './offlineGrant';

const log = createLogger('cleanup');

/**
 * Lock the private UI and clear sensitive state. Always runs on sign-out.
 *
 *   'wipe'            delete the user's SQLite file, encrypted vault files and
 *                     device keys (crypto-shredding), plus the offline grant.
 *   'keep-encrypted'  keep the encrypted database and vault on this device so the
 *                     same user signs back in instantly; nothing is readable
 *                     until they authenticate online again (the grant is removed).
 *
 * Unsynced changes are lost under 'wipe' — the UI warns before signing out.
 */
export async function clearLocalData(userId: string | null, policy: LogoutPolicy = usePreferencesStore.getState().logoutPolicy) {
  stopAutoSync();
  queryClient.clear();
  useTransferStore.getState().reset();
  clearKeyCache();
  resetDeviceIdCache();
  clearTempFiles();
  await clearGrant();
  await cancelAllReminders();
  if (!userId) {
    await closeDatabase();
    return;
  }
  if (policy === 'wipe') {
    await wipeUserDatabase(userId).catch((e) => log.warn('db wipe failed', e));
    deleteUserVault(userId);
    await destroyKeys(userId);
    usePreferencesStore.getState().resetAccountScoped();
  } else {
    await closeDatabase();
  }
}
