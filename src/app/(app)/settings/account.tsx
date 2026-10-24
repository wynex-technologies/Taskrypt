import { TriangleAlert, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, OfflineNotice, Screen, TextField, toast } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { deleteAccount } from '@/features/auth/authService';
import { useAuthStore } from '@/features/auth/authStore';
import { confirmSignOut } from '@/features/auth/confirmSignOut';
import { authenticate, getBiometricSupport } from '@/features/security/appLock';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

const PHRASE = 'DELETE';

export default function AccountScreen() {
  const theme = useTheme();
  const online = useIsOnline();
  const email = useAuthStore((s) => s.user?.email);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    // Re-confirm the device owner before an irreversible action.
    const support = await getBiometricSupport().catch(() => null);
    if (support?.enrolled && !(await authenticate('Confirm account deletion').catch(() => false))) return;
    setBusy(true);
    try {
      await deleteAccount();
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  return (
    <Screen title="Account" back keyboard>
      <View style={{ gap: theme.spacing.xl }}>
        <Card style={{ gap: 10 }}>
          <AppText variant="heading">Sign out</AppText>
          <AppText color="textMuted" variant="label">
            Signed in as {email}. Sign out to lock this device; your data stays in your account.
          </AppText>
          <Button label="Sign out" variant="secondary" onPress={confirmSignOut} />
        </Card>

        <Card style={{ gap: 12, borderColor: theme.colors.danger }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TriangleAlert size={20} color={theme.colors.danger} />
            <AppText variant="heading" color="danger">
              Delete account
            </AppText>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Mascot size={80} mood="error" />
          </View>
          <AppText variant="label">This permanently deletes:</AppText>
          <AppText color="textMuted" variant="label">
            • every task, list, tag and category{'\n'}• every document and folder in your vault, including stored files{'\n'}• your profile and sync history{'\n'}• all local data and encryption keys on this device
          </AppText>
          <AppText variant="caption" color="textMuted">
            Deletion happens on our servers immediately and cannot be undone. Other signed-in devices lose access at their next connection and wipe themselves.
          </AppText>
          {!online ? <OfflineNotice message="Account deletion needs an internet connection." /> : null}
          <TextField label={`Type ${PHRASE} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
          <Button label="Delete my account forever" icon={Trash2} variant="danger" fullWidth loading={busy} disabled={typed !== PHRASE || !online} onPress={remove} />
        </Card>
      </View>
    </Screen>
  );
}
