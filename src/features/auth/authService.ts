import type { Session, User } from '@supabase/supabase-js';

import { getOpenDbUserId, openUserDatabase } from '@/database';
import { mascot } from '@/features/animation/mascotStore';
import { purgeTemporaryFiles } from '@/features/documents/vaultService';
import { setSyncAuthFailureHandler, startAutoSync, syncNow } from '@/features/sync/syncService';
import { env } from '@/lib/env';
import { AppError, toAppError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getSupabase } from '@/services/supabase/client';
import { clearSessionStorage } from '@/services/supabase/secureSessionStorage';
import { rescheduleAll } from '@/services/notifications/reminders';
import { isEffectivelyOnline, useNetworkStore } from '@/stores/networkStore';
import type { LogoutPolicy } from '@/stores/preferencesStore';

import { useAuthStore, type AuthUser } from './authStore';
import { clearLocalData } from './localDataCleanup';
import { isGrantValid, readGrant, writeGrant } from './offlineGrant';

const log = createLogger('auth');

/** The account no longer exists (deleted elsewhere): local data must not survive. */
function isDeletedAccount(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return err?.code === 'user_not_found' || /user (from sub claim in jwt )?(does not exist|not found)/i.test(err?.message ?? '');
}

const toAuthUser = (u: User): AuthUser => ({ id: u.id, email: u.email ?? '', emailVerified: Boolean(u.email_confirmed_at ?? u.confirmed_at) });

const set = (patch: Parameters<ReturnType<typeof useAuthStore.getState>['setState']>[0]) => useAuthStore.getState().setState(patch);

/** Open the user's local world: database, sync and reminders. */
async function enterApp(user: AuthUser, mode: 'signedIn' | 'offline') {
  await openUserDatabase(user.id);
  set({ status: mode, user, pendingEmail: null, notice: null });
  startAutoSync();
  void rescheduleAll().catch(() => undefined);
  mascot.react('welcome');
}

async function onValidSession(session: Session) {
  const user = toAuthUser(session.user);
  if (!user.emailVerified) {
    set({ status: 'signedOut', pendingEmail: user.email });
    return;
  }
  await writeGrant(user.id, user.email);
  if (getOpenDbUserId() !== user.id || useAuthStore.getState().status !== 'signedIn') await enterApp(user, 'signedIn');
}

/**
 * Restore authentication at launch, applying the offline policy:
 *  - online with a valid session → server-validated sign-in
 *  - offline (or server unreachable) with a valid offline grant → offline mode
 *  - otherwise → signed out
 */
export async function bootstrapAuth(): Promise<void> {
  purgeTemporaryFiles();
  setSyncAuthFailureHandler(() => void revalidateSession());
  if (!env.isBackendConfigured) {
    set({ status: 'signedOut' });
    return;
  }
  const sb = getSupabase();
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' && useAuthStore.getState().status !== 'signedOut') {
      // Never call auth methods synchronously inside this callback (supabase-js lock).
      setTimeout(() => void forceSignOut('You were signed out.'), 0);
    }
    if (event === 'PASSWORD_RECOVERY' && session) set({ status: 'recovery', user: toAuthUser(session.user) });
  });

  const grant = await readGrant();
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (data.session) {
      if (isEffectivelyOnline()) {
        // Confirms with the server that the user still exists and the token is valid.
        const { data: u, error: userError } = await sb.auth.getUser();
        if (userError) throw userError;
        if (u.user) return onValidSession({ ...data.session, user: u.user });
      }
      if (isGrantValid(grant) && grant.userId === data.session.user.id) return enterApp(toAuthUser(data.session.user), 'offline');
      return onValidSession(data.session);
    }
  } catch (e) {
    const err = toAppError(e);
    if (err.code === 'network' && isGrantValid(grant)) {
      return enterApp({ id: grant.userId, email: grant.email, emailVerified: true }, 'offline');
    }
    if (err.code !== 'network') {
      log.warn('session invalid at launch', { code: err.code });
      if (isDeletedAccount(e)) return forceSignOut('This account no longer exists. Local data was removed.', 'wipe');
      return forceSignOut('Your session has ended. Please sign in again.');
    }
  }
  if (!isEffectivelyOnline() && isGrantValid(grant)) return enterApp({ id: grant.userId, email: grant.email, emailVerified: true }, 'offline');
  set({ status: 'signedOut' });
}

/** Called when connectivity returns while in offline mode, or when sync hits 401. */
export async function revalidateSession(): Promise<void> {
  if (!env.isBackendConfigured || !isEffectivelyOnline()) return;
  const sb = getSupabase();
  try {
    const { data, error } = await sb.auth.refreshSession();
    if (error) throw error;
    if (!data.session) throw new AppError('session_expired');
    const { data: u, error: userError } = await sb.auth.getUser();
    if (userError || !u.user) throw userError ?? new AppError('session_expired');
    await writeGrant(u.user.id, u.user.email ?? '');
    if (useAuthStore.getState().status === 'offline') {
      set({ status: 'signedIn', user: toAuthUser(u.user) });
      void syncNow('revalidated');
    }
  } catch (e) {
    const err = toAppError(e);
    if (err.code === 'network') return;
    // The server rejected us: the account was revoked, deleted or the password changed.
    if (isDeletedAccount(e)) await forceSignOut('This account no longer exists. Local data was removed.', 'wipe');
    else await forceSignOut('For your security, please sign in again.', 'keep-encrypted');
  }
}

let netSub: (() => void) | null = null;
export function watchConnectivityForRevalidation() {
  netSub?.();
  let was = isEffectivelyOnline();
  netSub = useNetworkStore.subscribe((s) => {
    const now = s.isOnline && !s.forcedOffline;
    if (now && !was && useAuthStore.getState().status === 'offline') void revalidateSession();
    was = now;
  });
}

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

function requireOnline() {
  if (!env.isBackendConfigured) throw new AppError('not_configured');
  if (!isEffectivelyOnline()) throw new AppError('offline');
}

export async function signUp(params: { email: string; password: string; displayName: string }) {
  requireOnline();
  const { data, error } = await getSupabase().auth.signUp({
    email: params.email.trim().toLowerCase(),
    password: params.password,
    options: { data: { display_name: params.displayName.trim() }, emailRedirectTo: env.authRedirectUrl },
  });
  if (error) throw toAppError(error);
  // With e-mail confirmation enabled Supabase returns no session until verified.
  if (data.session) await onValidSession(data.session);
  else set({ pendingEmail: params.email.trim().toLowerCase() });
  return { needsVerification: !data.session };
}

export async function signIn(email: string, password: string) {
  requireOnline();
  const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) {
    const err = toAppError(error);
    if (err.code === 'email_not_verified') set({ pendingEmail: email.trim().toLowerCase() });
    throw err;
  }
  await onValidSession(data.session);
  return { needsVerification: !toAuthUser(data.user).emailVerified };
}

export async function verifyEmailCode(email: string, token: string) {
  requireOnline();
  const { data, error } = await getSupabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'email' });
  if (error) throw toAppError(error);
  if (!data.session) throw new AppError('unknown');
  await onValidSession(data.session);
}

export async function resendVerification(email: string) {
  requireOnline();
  const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: env.authRedirectUrl } });
  if (error) throw toAppError(error);
}

export async function sendPasswordReset(email: string) {
  requireOnline();
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: env.authRedirectUrl });
  // Do not reveal whether the address exists; only surface transport/rate errors.
  if (error) {
    const err = toAppError(error);
    if (err.code === 'network' || err.code === 'rate_limited') throw err;
  }
}

export async function verifyRecoveryCode(email: string, token: string) {
  requireOnline();
  const { data, error } = await getSupabase().auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: 'recovery' });
  if (error) throw toAppError(error);
  if (!data.session) throw new AppError('unknown');
  set({ status: 'recovery', user: toAuthUser(data.session.user) });
}

/** Exchange a PKCE `code` from an e-mail deep link (taskrypt://auth/callback?code=…). */
export async function completeDeepLink(code: string, type: string | null) {
  requireOnline();
  const { data, error } = await getSupabase().auth.exchangeCodeForSession(code);
  if (error) throw toAppError(error);
  if (type === 'recovery') set({ status: 'recovery', user: toAuthUser(data.session.user) });
  else await onValidSession(data.session);
}

export async function updatePassword(newPassword: string) {
  requireOnline();
  const sb = getSupabase();
  const { data, error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw toAppError(error);
  // Sign out other devices; this device keeps its fresh session.
  await sb.auth.signOut({ scope: 'others' }).catch(() => undefined);
  const { data: s } = await sb.auth.getSession();
  if (s.session && useAuthStore.getState().status === 'recovery') {
    set({ status: 'signedOut' });
    await onValidSession(s.session);
  }
  return data.user;
}

export async function signOut(policy?: LogoutPolicy) {
  const userId = useAuthStore.getState().user?.id ?? getOpenDbUserId();
  // Lock the UI first so private screens unmount immediately.
  set({ status: 'signedOut', user: null, pendingEmail: null });
  try {
    if (env.isBackendConfigured) await getSupabase().auth.signOut({ scope: 'local' });
  } catch {
    // Offline sign-out still clears everything locally.
  }
  await clearSessionStorage().catch(() => undefined);
  await clearLocalData(userId, policy);
}

async function forceSignOut(notice: string, policy?: LogoutPolicy) {
  await signOut(policy);
  set({ notice });
}

/**
 * Permanently delete the account. The privileged work (deleting storage objects
 * and the auth user) runs in the `delete-account` Edge Function, server-side.
 */
export async function deleteAccount() {
  requireOnline();
  const { error } = await getSupabase().functions.invoke('delete-account', { method: 'POST', body: { confirm: true } });
  if (error) throw toAppError(error);
  await signOut('wipe');
  set({ notice: 'Your account and all of its data were deleted.' });
}
