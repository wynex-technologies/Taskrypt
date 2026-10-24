import * as Crypto from 'expo-crypto';
import { z } from 'zod';

import { getDb, getOpenDbUserId } from '@/database';
import { AppError, toAppError } from '@/lib/errors';
import { kvGet, kvSet } from '@/repositories/kvRepository';
import { unwrapDataKey, wrapDataKey } from '@/services/encryption/e2ee';
import { getE2eeKey, storeE2eeKey } from '@/services/encryption/keyManager';
import { getSupabase } from '@/services/supabase/client';
import { isEffectivelyOnline } from '@/stores/networkStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { Profile } from '@/types/domain';

const EDITABLE = ['display_name', 'avatar_color', 'daily_goal', 'timezone'] as const;

export const profileUpdateSchema = z.object({
  display_name: z.string().trim().min(1, 'Enter your name').max(80).optional(),
  avatar_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  daily_goal: z.number().int().min(1).max(50).optional(),
  timezone: z.string().max(64).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

function userId() {
  const id = getOpenDbUserId();
  if (!id) throw new AppError('unauthorized');
  return id;
}

async function cache(profile: Profile) {
  await kvSet(getDb(), 'profile', JSON.stringify(profile));
  usePreferencesStore.getState().set('dailyGoal', profile.daily_goal);
}

/** Server profile when online (cached for offline use), cached copy otherwise. */
export async function fetchProfile(): Promise<Profile | null> {
  const id = userId();
  if (isEffectivelyOnline()) {
    try {
      const { data, error } = await getSupabase().from('profiles').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (data) {
        await cache(data as Profile);
        return data as Profile;
      }
    } catch (e) {
      if (toAppError(e).code !== 'network') throw toAppError(e);
    }
  }
  const raw = await kvGet(getDb(), 'profile');
  return raw ? (JSON.parse(raw) as Profile) : null;
}

export async function updateProfile(patch: ProfileUpdate): Promise<Profile> {
  const id = userId();
  if (!isEffectivelyOnline()) throw new AppError('offline');
  const clean = profileUpdateSchema.parse(patch);
  const body = Object.fromEntries(Object.entries(clean).filter(([k]) => (EDITABLE as readonly string[]).includes(k)));
  const { data, error } = await getSupabase().from('profiles').update(body).eq('id', id).select('*').single();
  if (error) throw toAppError(error);
  await cache(data as Profile);
  return data as Profile;
}

export async function fetchStorageUsage(): Promise<{ used: number; quota: number; count: number } | null> {
  if (!isEffectivelyOnline()) return null;
  const { data, error } = await getSupabase().rpc('get_storage_usage');
  if (error) throw toAppError(error);
  const row = (Array.isArray(data) ? data[0] : data) as { used_bytes: number; quota_bytes: number; document_count: number } | undefined;
  return row ? { used: Number(row.used_bytes), quota: Number(row.quota_bytes), count: Number(row.document_count) } : null;
}

// ---------------------------------------------------------------------------
// Zero-knowledge (end-to-end) vault mode
// ---------------------------------------------------------------------------

export async function e2eeStatus(profile: Profile | null): Promise<'off' | 'locked' | 'unlocked'> {
  if (!profile?.e2ee_enabled || !profile.e2ee_wrapped_key) return 'off';
  return (await getE2eeKey(userId())) ? 'unlocked' : 'locked';
}

/** Create a data key, wrap it with the passphrase and publish only the wrapped form. */
export async function enableE2ee(passphrase: string): Promise<void> {
  const id = userId();
  if (!isEffectivelyOnline()) throw new AppError('offline');
  const dek = Crypto.getRandomBytes(32);
  const wrapped = await wrapDataKey({ userId: id, passphrase, dek, salt: Crypto.getRandomBytes(16), nonce: Crypto.getRandomBytes(12) });
  const { error } = await getSupabase()
    .from('profiles')
    .update({ e2ee_enabled: true, e2ee_salt: wrapped.salt, e2ee_wrapped_key: wrapped.wrapped, e2ee_kdf: wrapped.kdf })
    .eq('id', id);
  if (error) throw toAppError(error);
  await storeE2eeKey(id, dek);
  dek.fill(0);
  usePreferencesStore.getState().set('e2eeEnabled', true);
}

/** Unlock on a new device (or after a wipe) with the vault passphrase. */
export async function unlockE2ee(passphrase: string, profile: Profile): Promise<void> {
  const id = userId();
  if (!profile.e2ee_salt || !profile.e2ee_wrapped_key || !profile.e2ee_kdf) throw new AppError('not_found');
  const dek = await unwrapDataKey({ userId: id, passphrase, wrapped: { salt: profile.e2ee_salt, wrapped: profile.e2ee_wrapped_key, kdf: profile.e2ee_kdf } });
  await storeE2eeKey(id, dek);
  dek.fill(0);
  usePreferencesStore.getState().set('e2eeEnabled', true);
}

/** Stop encrypting NEW uploads end-to-end. Existing e2ee files still need the key. */
export function pauseE2eeForNewUploads() {
  usePreferencesStore.getState().set('e2eeEnabled', false);
}
