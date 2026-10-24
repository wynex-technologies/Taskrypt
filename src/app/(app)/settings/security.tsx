import { useQuery } from '@tanstack/react-query';
import { Fingerprint, KeyRound, Lock, LogOut, ShieldCheck, Timer } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, Chip, ChipRow, ListRow, OfflineNotice, RowGroup, Screen, Sheet, SwitchRow, TextField, toast } from '@/components';
import { e2eeStatus, enableE2ee, pauseE2eeForNewUploads, unlockE2ee } from '@/features/profile/profileService';
import { authenticate, getBiometricSupport } from '@/features/security/appLock';
import { useProfile } from '@/hooks/queries';
import { grantExpiresAt, readGrant } from '@/features/auth/offlineGrant';
import { env } from '@/lib/env';
import { formatDateTime } from '@/lib/time';
import { useIsOnline } from '@/stores/networkStore';
import { usePreferencesStore, type LockTimeout } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

const TIMEOUTS: { value: LockTimeout; label: string }[] = [
  { value: 0, label: 'Immediately' },
  { value: 60, label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 900, label: '15 min' },
];

export default function SecuritySettings() {
  const theme = useTheme();
  const online = useIsOnline();
  const prefs = usePreferencesStore();
  const bio = useQuery({ queryKey: ['biometrics'], queryFn: getBiometricSupport });
  const grant = useQuery({ queryKey: ['grant'], queryFn: readGrant });
  const profile = useProfile();
  const e2ee = useQuery({ queryKey: ['profile', 'e2ee', profile.data?.e2ee_enabled, prefs.e2eeEnabled], queryFn: () => e2eeStatus(profile.data ?? null), enabled: profile.isFetched });
  const [sheet, setSheet] = useState<'enable' | 'unlock' | null>(null);
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleLock = async (v: boolean) => {
    if (v) {
      const support = bio.data ?? (await getBiometricSupport());
      if (!support.available || !support.enrolled) {
        toast.error('Set up Face ID, fingerprint or a device passcode first.');
        return;
      }
      if (!(await authenticate('Confirm to turn on app lock'))) return;
    }
    prefs.set('biometricLockEnabled', v);
  };

  const submitE2ee = async () => {
    setBusy(true);
    try {
      if (sheet === 'enable') {
        if (pass !== confirm) throw new Error('Passphrases do not match');
        await enableE2ee(pass);
        toast.success('End-to-end encryption is on for new uploads');
      } else if (profile.data) {
        await unlockE2ee(pass, profile.data);
        toast.success('Vault unlocked on this device');
      }
      setSheet(null);
      setPass('');
      setConfirm('');
      void e2ee.refetch();
      void profile.refetch();
    } catch (e) {
      toast.error(e instanceof Error && e.message === 'Passphrases do not match' ? e.message : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Security & privacy" back>
      <View style={{ gap: theme.spacing.xl }}>
        <RowGroup title="App lock">
          <SwitchRow
            icon={Fingerprint}
            title={`Lock with ${bio.data?.label ?? 'biometrics'}`}
            subtitle={bio.data && !bio.data.enrolled ? 'No biometrics or passcode set up on this device' : 'Required when opening Taskrypt'}
            value={prefs.biometricLockEnabled}
            onValueChange={(v) => void toggleLock(v)}
          />
        </RowGroup>
        {prefs.biometricLockEnabled ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Timer size={15} color={theme.colors.textMuted} />
              <AppText variant="label" color="textMuted">
                Lock after leaving the app
              </AppText>
            </View>
            <ChipRow>
              {TIMEOUTS.map((t) => (
                <Chip key={t.value} label={t.label} selected={prefs.lockTimeoutSeconds === t.value} onPress={() => prefs.set('lockTimeoutSeconds', t.value)} />
              ))}
            </ChipRow>
          </View>
        ) : null}

        <RowGroup title="When I sign out">
          <ListRow icon={LogOut} title="Remove everything from this device" subtitle="Deletes local tasks, offline files and encryption keys (recommended)" chevron={false} onPress={() => prefs.set('logoutPolicy', 'wipe')} right={prefs.logoutPolicy === 'wipe' ? <Chip label="Selected" selected /> : undefined} />
          <ListRow icon={Lock} title="Keep encrypted, locked data" subtitle="Faster sign-in for the same account; unreadable until you sign in online" chevron={false} onPress={() => prefs.set('logoutPolicy', 'keep-encrypted')} right={prefs.logoutPolicy === 'keep-encrypted' ? <Chip label="Selected" selected /> : undefined} />
        </RowGroup>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <KeyRound size={18} color={theme.colors.accentPlum} />
            <AppText variant="heading">Zero-knowledge vault</AppText>
          </View>
          <AppText color="textMuted" variant="label">
            Encrypt documents on this phone before upload with a separate vault passphrase. Taskrypt&apos;s servers only ever see ciphertext.
          </AppText>
          <AppText variant="caption" color="warning">
            If you forget the passphrase, end-to-end encrypted documents cannot be recovered — not even by password reset. Other devices need the passphrase once to open them. Shared links are not possible for these files.
          </AppText>
          {!online ? <OfflineNotice message="Changing encryption settings needs a connection." /> : null}
          {e2ee.data === 'off' ? (
            <Button label="Set up vault passphrase" variant="soft" disabled={!online} onPress={() => setSheet('enable')} />
          ) : e2ee.data === 'locked' ? (
            <Button label="Unlock vault on this device" variant="soft" onPress={() => setSheet('unlock')} />
          ) : e2ee.data === 'unlocked' ? (
            <SwitchRow title="Encrypt new uploads end-to-end" value={prefs.e2eeEnabled} onValueChange={(v) => (v ? prefs.set('e2eeEnabled', true) : pauseE2eeForNewUploads())} />
          ) : null}
        </Card>

        <RowGroup title="Offline access">
          <ListRow
            icon={ShieldCheck}
            title={`Up to ${env.offlineGraceDays} days without a connection`}
            subtitle={
              grant.data
                ? `Last verified online ${formatDateTime(grant.data.verifiedAt)}. Offline access ends ${formatDateTime(grantExpiresAt(grant.data).toISOString())} unless you reconnect.`
                : 'Sign in online to enable offline access.'
            }
          />
        </RowGroup>
        <AppText variant="caption" color="textSubtle">
          While offline, Taskrypt cannot learn that your account was disabled or your password changed elsewhere. Those take effect the next time you are online.
        </AppText>
      </View>

      <Sheet visible={!!sheet} onClose={() => setSheet(null)} title={sheet === 'enable' ? 'Create vault passphrase' : 'Unlock vault'}>
        <TextField label="Vault passphrase" secure value={pass} onChangeText={setPass} autoCapitalize="none" helper="At least 10 characters. Different from your login password." />
        {sheet === 'enable' ? (
          <>
            <TextField label="Confirm passphrase" secure value={confirm} onChangeText={setConfirm} autoCapitalize="none" />
            <SwitchRow title="I understand a lost passphrase means lost files" value={ack} onValueChange={setAck} />
          </>
        ) : null}
        <Button label={sheet === 'enable' ? 'Turn on' : 'Unlock'} fullWidth loading={busy} disabled={pass.length < 10 || (sheet === 'enable' && !ack)} onPress={submitE2ee} />
      </Sheet>
    </Screen>
  );
}
