import { router } from 'expo-router';
import { Bell, ChartColumn, CloudDownload, FileText, HardDrive, ListTodo, LogOut, Palette, RefreshCw, ShieldCheck, Sparkles, UserRound } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText, Card, Credit, ListRow, RowGroup, Screen } from '@/components';
import { Mascot, useCompanion } from '@/features/animation/Mascot';
import { confirmSignOut } from '@/features/auth/confirmSignOut';
import { useAuthStore } from '@/features/auth/authStore';
import { SyncBadge } from '@/features/sync/SyncBadge';
import { useProfile } from '@/hooks/queries';
import { useTheme } from '@/theme';

export default function Profile() {
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const profile = useProfile();
  const companion = useCompanion();
  const name = profile.data?.display_name ?? user?.email?.split('@')[0] ?? '';

  return (
    <Screen title="Me" edgesBottom={false}>
      <View style={{ gap: theme.spacing.xl }}>
        <Card elevated tone="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} onPress={() => router.push('/settings/profile')} accessibilityLabel={`Edit profile, ${name}`}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: profile.data?.avatar_color ?? theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="title" style={{ color: '#FFFFFF' }}>
              {(name[0] ?? '?').toUpperCase()}
            </AppText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading" numberOfLines={1}>
              {name}
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {user?.email}
            </AppText>
            {status === 'offline' ? (
              <AppText variant="caption" color="warning">
                Offline session — will re-verify when online
              </AppText>
            ) : null}
          </View>
          <Mascot size={56} />
        </Card>
        <SyncBadge />

        <RowGroup title="Productivity">
          <ListRow icon={ChartColumn} title="Statistics" subtitle="Streaks, completions and goals" onPress={() => router.push('/stats')} />
          <ListRow icon={Bell} title="Reminders" subtitle="Upcoming notifications" onPress={() => router.push('/reminders')} />
          <ListRow icon={ListTodo} title="Lists, categories & tags" onPress={() => router.push('/settings/lists')} />
        </RowGroup>

        <RowGroup title="Vault">
          <ListRow icon={CloudDownload} title="Offline downloads" onPress={() => router.push('/documents/offline')} />
          <ListRow icon={HardDrive} title="Storage usage" onPress={() => router.push('/documents/storage')} />
        </RowGroup>

        <RowGroup title="Settings">
          <ListRow icon={UserRound} title="Profile" subtitle="Name, colour and daily goal" onPress={() => router.push('/settings/profile')} />
          <ListRow icon={ShieldCheck} title="Security & privacy" subtitle="App lock, encryption, sign-out policy" onPress={() => router.push('/settings/security')} />
          <ListRow icon={RefreshCw} title="Sync" subtitle="Status, pending changes, retry" onPress={() => router.push('/settings/sync')} />
          <ListRow icon={Sparkles} title="Companion" subtitle={`${companion.name} · choose your animated buddy`} onPress={() => router.push('/settings/companion')} />
          <ListRow icon={Palette} title="Appearance" subtitle="Theme, motion and haptics" onPress={() => router.push('/settings/theme')} />
          <ListRow icon={FileText} title="Privacy policy" onPress={() => router.push('/privacy')} />
        </RowGroup>

        <RowGroup>
          <ListRow icon={LogOut} title="Sign out" destructive chevron={false} onPress={confirmSignOut} testID="sign-out" />
          <ListRow title="Delete account…" destructive onPress={() => router.push('/settings/account')} />
        </RowGroup>
        <View style={{ gap: 4 }}>
          <AppText variant="caption" color="textSubtle" align="center">
            Taskrypt 1.0.0
          </AppText>
          <Credit />
        </View>
      </View>
    </Screen>
  );
}
