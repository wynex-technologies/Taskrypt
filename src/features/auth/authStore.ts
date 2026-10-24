import { create } from 'zustand';

export type AuthStatus =
  /** Restoring the persisted session at launch. */
  | 'booting'
  | 'signedOut'
  /** Signed in with a server-validated session. */
  | 'signedIn'
  /** Unlocked from the offline grant; server checks are pending. */
  | 'offline'
  /** Verified a password-recovery code; must set a new password. */
  | 'recovery';

export type AuthUser = { id: string; email: string; emailVerified: boolean };

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  /** E-mail awaiting verification after sign-up / unverified sign-in. */
  pendingEmail: string | null;
  /** Reason shown on the login screen after a forced sign-out. */
  notice: string | null;
  setState: (patch: Partial<Omit<AuthState, 'setState'>>) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'booting',
  user: null,
  pendingEmail: null,
  notice: null,
  setState: (patch) => set(patch),
}));

export const isAuthenticated = (s: Pick<AuthState, 'status'>) => s.status === 'signedIn' || s.status === 'offline';
