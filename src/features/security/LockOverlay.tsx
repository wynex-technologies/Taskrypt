import { Fingerprint, LogOut } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Mascot } from '@/features/animation/Mascot';
import { signOut } from '@/features/auth/authService';
import { useTheme } from '@/theme';

import { unlock, useLockStore } from './appLock';

/** Full-screen cover shown while the app is locked or in the app switcher. */
export function LockOverlay() {
  const theme = useTheme();
  const locked = useLockStore((s) => s.locked);
  const obscured = useLockStore((s) => s.obscured);
  const [failed, setFailed] = useState(false);

  const tryUnlock = useCallback(async () => {
    setFailed(!(await unlock().catch(() => false)));
  }, []);

  useEffect(() => {
    if (!locked) return;
    unlock()
      .catch(() => false)
      .then((ok) => setFailed(!ok));
  }, [locked]);

  if (!locked && !obscured) return null;

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => undefined} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]} accessibilityViewIsModal>
        <Mascot size={130} mood="idle" />
        <AppText variant="title" align="center">
          Taskrypt is locked
        </AppText>
        <AppText color="textMuted" align="center" style={{ maxWidth: 300 }}>
          {failed ? 'We could not confirm it was you. Try again.' : 'Unlock to view your tasks and private documents.'}
        </AppText>
        {locked ? (
          <View style={{ gap: 12, alignSelf: 'stretch', maxWidth: 360, width: '100%' }}>
            <Button label="Unlock" icon={Fingerprint} onPress={tryUnlock} fullWidth size="lg" />
            <Button label="Sign out instead" icon={LogOut} variant="ghost" onPress={() => void signOut()} fullWidth />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
});
