import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { clearKeyCache } from '@/services/encryption/keyManager';
import { usePreferencesStore } from '@/stores/preferencesStore';

/**
 * Optional biometric app lock. When enabled, the private UI is covered by a lock
 * screen at launch and whenever the app returns from the background after the
 * configured timeout. In-memory key copies are dropped while locked.
 */
type LockState = {
  locked: boolean;
  /** Hide content in the app switcher snapshot. */
  obscured: boolean;
  setLocked: (v: boolean) => void;
};

export const useLockStore = create<LockState>((set) => ({
  locked: false,
  obscured: false,
  setLocked: (locked) => set({ locked }),
}));

export type BiometricSupport = { available: boolean; enrolled: boolean; label: string };

export async function getBiometricSupport(): Promise<BiometricSupport> {
  const [hardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
    ? 'Face ID'
    : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ? 'Fingerprint'
      : 'Device passcode';
  return { available: hardware, enrolled, label };
}

export async function authenticate(reason = 'Unlock Taskrypt'): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    // Falls back to the device passcode so users are never locked out by a sensor.
    disableDeviceFallback: false,
  });
  return result.success;
}

export async function unlock(): Promise<boolean> {
  const ok = await authenticate();
  if (ok) useLockStore.getState().setLocked(false);
  return ok;
}

let backgroundedAt: number | null = null;
let sub: { remove: () => void } | null = null;
let suspended = 0;

/**
 * Run a flow that legitimately leaves the app (document picker, share sheet,
 * system preview) without triggering the lock when it returns.
 */
export async function withLockSuspended<T>(fn: () => Promise<T>): Promise<T> {
  suspended++;
  try {
    return await fn();
  } finally {
    // Let the 'active' AppState event land first.
    setTimeout(() => {
      suspended = Math.max(0, suspended - 1);
    }, 800);
  }
}

function onChange(state: AppStateStatus) {
  if (suspended > 0) {
    backgroundedAt = null;
    return;
  }
  const prefs = usePreferencesStore.getState();
  if (state === 'inactive' || state === 'background') {
    useLockStore.setState({ obscured: prefs.biometricLockEnabled });
    if (state === 'background') {
      backgroundedAt = Date.now();
      if (prefs.biometricLockEnabled && prefs.lockTimeoutSeconds === 0) {
        clearKeyCache();
        useLockStore.getState().setLocked(true);
      }
    }
    return;
  }
  useLockStore.setState({ obscured: false });
  if (!prefs.biometricLockEnabled || backgroundedAt === null) return;
  const away = (Date.now() - backgroundedAt) / 1000;
  backgroundedAt = null;
  if (away >= prefs.lockTimeoutSeconds) {
    clearKeyCache();
    useLockStore.getState().setLocked(true);
  }
}

/** `lockNow` is true when a persisted session was restored at launch (not after a fresh sign-in). */
export function startAppLock(lockNow: boolean) {
  sub?.remove();
  if (lockNow && usePreferencesStore.getState().biometricLockEnabled) useLockStore.getState().setLocked(true);
  sub = AppState.addEventListener('change', onChange);
}

export function stopAppLock() {
  sub?.remove();
  sub = null;
  useLockStore.setState({ locked: false, obscured: false });
}
