import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_CHARACTER, type CharacterId } from '@/features/animation/characters';
import type { AccentId } from '@/theme/accents';

export type ThemePreference = 'system' | 'light' | 'dark';
export type MotionPreference = 'system' | 'full' | 'reduced';
/** What happens to local data on sign-out. */
export type LogoutPolicy = 'wipe' | 'keep-encrypted';
export type LockTimeout = 0 | 60 | 300 | 900;
export type AccentPreference = 'companion' | AccentId;

type Preferences = {
  themePreference: ThemePreference;
  motionPreference: MotionPreference;
  hapticsEnabled: boolean;
  onboardingComplete: boolean;
  biometricLockEnabled: boolean;
  lockTimeoutSeconds: LockTimeout;
  logoutPolicy: LogoutPolicy;
  e2eeEnabled: boolean;
  remindersEnabled: boolean;
  defaultReminderMinutes: number;
  autoSyncOnCellular: boolean;
  dailyGoal: number;
  /** Which animated companion appears across the app. */
  mascotCharacter: CharacterId;
  /** App colour palette; 'companion' follows the chosen character. */
  accentPreference: AccentPreference;
};

type Actions = {
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  resetAccountScoped: () => void;
};

export const DEFAULT_PREFERENCES: Preferences = {
  themePreference: 'light',
  motionPreference: 'system',
  hapticsEnabled: true,
  onboardingComplete: false,
  biometricLockEnabled: false,
  lockTimeoutSeconds: 60,
  logoutPolicy: 'wipe',
  e2eeEnabled: false,
  remindersEnabled: true,
  defaultReminderMinutes: 15,
  autoSyncOnCellular: true,
  dailyGoal: 5,
  mascotCharacter: DEFAULT_CHARACTER,
  accentPreference: 'companion',
};

/** Non-sensitive UI preferences. Secrets and keys never go here. */
export const usePreferencesStore = create<Preferences & Actions>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      set: (key, value) => set({ [key]: value } as Partial<Preferences>),
      resetAccountScoped: () =>
        set({
          biometricLockEnabled: false,
          e2eeEnabled: false,
          dailyGoal: DEFAULT_PREFERENCES.dailyGoal,
        }),
    }),
    {
      name: 'taskora.preferences',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _s, resetAccountScoped: _r, ...rest }) => rest,
    },
  ),
);
