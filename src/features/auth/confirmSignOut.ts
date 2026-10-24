import { Alert } from 'react-native';

import { toast } from '@/components/Toast';
import { useSyncStore } from '@/features/sync/syncService';
import { usePreferencesStore } from '@/stores/preferencesStore';

import { signOut } from './authService';

/** Sign-out confirmation that warns about unsynced changes under the wipe policy. */
export function confirmSignOut() {
  const pending = useSyncStore.getState().queue;
  const unsynced = pending.pending + pending.inflight + pending.failed;
  const policy = usePreferencesStore.getState().logoutPolicy;
  const warning =
    unsynced > 0 && policy === 'wipe'
      ? `${unsynced} change${unsynced === 1 ? ' has' : 's have'} not synced yet and will be lost. Connect to the internet first to keep them.`
      : policy === 'wipe'
        ? 'Your tasks and offline documents will be removed from this device. Everything stays safe in your account.'
        : 'Encrypted data stays on this device but stays locked until you sign in again.';
  Alert.alert('Sign out?', warning, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => void signOut().catch(toast.error) },
  ]);
}
