import LottieView from 'lottie-react-native';
import { CircleAlert, CloudOff, RefreshCw, Trash2, WifiOff } from 'lucide-react-native';
import { Alert, View } from 'react-native';

import { AppText, Button, Card, ListRow, RowGroup, Screen, SwitchRow, toast } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { discardFailedOperations, retryFailedOperations, syncNow, useSyncStore } from '@/features/sync/syncService';
import { useQueueItems } from '@/hooks/queries';
import { formatDateTime, relativeTime } from '@/lib/time';
import { useIsOnline, useNetworkStore } from '@/stores/networkStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

const ENTITY_LABEL: Record<string, string> = {
  tasks: 'Task',
  task_lists: 'List',
  task_categories: 'Category',
  task_tags: 'Tag',
  task_tag_assignments: 'Tag on task',
  document_folders: 'Folder',
  documents: 'Document',
};

export default function SyncStatus() {
  const theme = useTheme();
  const online = useIsOnline();
  const forced = useNetworkStore((s) => s.forcedOffline);
  const setForced = useNetworkStore((s) => s.setForcedOffline);
  const s = useSyncStore();
  const items = useQueueItems();
  const cellular = usePreferencesStore((p) => p.autoSyncOnCellular);
  const setPref = usePreferencesStore((p) => p.set);
  const failed = (items.data ?? []).filter((i) => i.status === 'failed');
  const waiting = (items.data ?? []).filter((i) => i.status !== 'failed');
  const syncing = s.phase === 'syncing';
  const allSynced = online && !syncing && failed.length === 0 && waiting.length === 0;

  return (
    <Screen title="Sync" back onRefresh={() => void syncNow('manual')} refreshing={syncing}>
      <View style={{ gap: theme.spacing.xl }}>
        <Card elevated tone="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Mascot size={80} mood={!online ? 'offline' : syncing ? 'loading' : failed.length ? 'error' : 'idle'} />
          <View style={{ flex: 1, gap: 4 }}>
            {allSynced ? (
              <LottieView
                source={require('../../../../assets/lottie/sync-success.json')}
                autoPlay={!theme.reduceMotion}
                progress={theme.reduceMotion ? 1 : undefined}
                loop={false}
                style={{ width: 36, height: 36 }}
              />
            ) : null}
            <AppText variant="heading">{!online ? 'Offline' : syncing ? 'Syncing…' : failed.length ? 'Needs attention' : waiting.length ? 'Changes waiting' : 'All synced'}</AppText>
            <AppText variant="caption" color="textMuted">
              Last sync {relativeTime(s.lastSyncAt)}
              {s.lastSyncAt ? ` · ${formatDateTime(s.lastSyncAt)}` : ''}
            </AppText>
            {s.lastError ? (
              <AppText variant="caption" color="danger">
                {s.lastError}
              </AppText>
            ) : null}
          </View>
        </Card>
        <Button label="Sync now" icon={RefreshCw} loading={syncing} disabled={!online} fullWidth onPress={() => syncNow('manual').then((r) => r && toast.success(`Synced · ${r.pushed} sent, ${r.pulled} received`))} />

        {s.lastReport ? (
          <Card tone="sunken" style={{ gap: 4 }}>
            <AppText variant="label">Last run</AppText>
            <AppText variant="caption" color="textMuted">
              {s.lastReport.applied} applied · {s.lastReport.stale} resolved in favour of a newer edit · {s.lastReport.duplicate} already applied · {s.lastReport.rejected} rejected · {s.lastReport.pulled} received
            </AppText>
          </Card>
        ) : null}

        {failed.length ? (
          <RowGroup title={`Failed (${failed.length})`}>
            {failed.map((f) => (
              <ListRow key={f.op_id} icon={CircleAlert} iconColor={theme.colors.danger} title={`${ENTITY_LABEL[f.entity] ?? f.entity} ${f.kind === 'row' ? f.op : f.kind.replace('_', ' ')}`} subtitle={f.last_error ?? 'Unknown error'} />
            ))}
          </RowGroup>
        ) : null}
        {failed.length ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Retry failed" icon={RefreshCw} variant="soft" style={{ flex: 1 }} disabled={!online} onPress={() => void retryFailedOperations()} />
            <Button
              label="Discard"
              icon={Trash2}
              variant="ghost"
              onPress={() =>
                Alert.alert('Discard failed changes?', 'These local changes will never reach the server. Other devices keep their version.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Discard', style: 'destructive', onPress: () => void discardFailedOperations() },
                ])
              }
            />
          </View>
        ) : null}

        {waiting.length ? (
          <RowGroup title={`Waiting (${waiting.length})`}>
            {waiting.slice(0, 30).map((w) => (
              <ListRow
                key={w.op_id}
                icon={online ? RefreshCw : CloudOff}
                title={`${ENTITY_LABEL[w.entity] ?? w.entity} ${w.kind === 'row' ? (w.op === 'delete' ? 'deletion' : 'change') : w.kind.replace('_', ' ')}`}
                subtitle={`${relativeTime(w.created_at)}${w.attempts ? ` · ${w.attempts} attempt(s)` : ''}${w.last_error ? ` · ${w.last_error}` : ''}`}
              />
            ))}
          </RowGroup>
        ) : null}

        <RowGroup title="Options">
          <SwitchRow title="Sync on mobile data" subtitle="Automatic background sync when not on Wi-Fi" value={cellular} onValueChange={(v) => setPref('autoSyncOnCellular', v)} />
          <SwitchRow icon={WifiOff} title="Work offline" subtitle="Pause all network sync (for testing or saving data)" value={forced} onValueChange={setForced} />
        </RowGroup>

        <Card tone="sunken" style={{ gap: 6 }}>
          <AppText variant="label">How conflicts are resolved</AppText>
          <AppText variant="caption" color="textMuted">
            When the same item is changed on two devices, the most recent edit wins and the other device updates automatically. Deletions follow the same rule. Every change has a unique id, so retries never create duplicates.
          </AppText>
        </Card>
      </View>
    </Screen>
  );
}
