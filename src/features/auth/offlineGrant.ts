import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import { env } from '@/lib/env';

/**
 * Offline access policy.
 *
 * After a successful ONLINE authentication the app records a grant
 * {userId, email, verifiedAt} in SecureStore. While the device is offline the
 * app may unlock the local (encrypted) data for that user until
 * verifiedAt + OFFLINE_GRACE_DAYS. The grant is refreshed on every successful
 * online session check and destroyed on sign-out.
 *
 * Limitation (by design, documented): while offline the app cannot learn that
 * the account was disabled, the password changed or the session revoked. Those
 * take effect at the next online check, which also forces sign-out.
 */

const KEY = 'taskora.offline-grant';
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const grantSchema = z.object({
  userId: z.uuid(),
  email: z.string().max(320),
  verifiedAt: z.string(),
});
export type OfflineGrant = z.infer<typeof grantSchema>;

export async function readGrant(): Promise<OfflineGrant | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTS);
    if (!raw) return null;
    const parsed = grantSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeGrant(userId: string, email: string): Promise<void> {
  const grant: OfflineGrant = { userId, email, verifiedAt: new Date().toISOString() };
  await SecureStore.setItemAsync(KEY, JSON.stringify(grant), OPTS);
}

export async function clearGrant(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTS).catch(() => undefined);
}

export function isGrantValid(grant: OfflineGrant | null, now = Date.now(), graceDays = env.offlineGraceDays): grant is OfflineGrant {
  if (!grant || graceDays <= 0) return false;
  const at = new Date(grant.verifiedAt).getTime();
  if (Number.isNaN(at) || at > now + 5 * 60_000) return false; // clock rolled back / tampered
  return now - at <= graceDays * 86_400_000;
}

export function grantExpiresAt(grant: OfflineGrant, graceDays = env.offlineGraceDays): Date {
  return new Date(new Date(grant.verifiedAt).getTime() + graceDays * 86_400_000);
}
