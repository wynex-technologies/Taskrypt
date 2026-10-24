import { router } from 'expo-router';
import { CloudDownload, HardDrive } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText, Card, ListRow, OfflineNotice, ProgressBar, ProgressRing, RowGroup, Screen } from '@/components';
import { useKindColor } from '@/features/documents/components/DocumentRow';
import { kindOfMime, labelOfMime } from '@/features/documents/fileTypes';
import { useLocalStorageUsage, useRemoteStorageUsage } from '@/hooks/queries';
import { formatBytes } from '@/lib/bytes';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';

function KindRow({ mime, bytes, n, total }: { mime: string; bytes: number; n: number; total: number }) {
  const tone = useKindColor(kindOfMime(mime));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText variant="label">{labelOfMime(mime)}</AppText>
        <AppText variant="caption" color="textMuted">
          {n} · {formatBytes(bytes)}
        </AppText>
      </View>
      <ProgressBar value={total ? bytes / total : 0} color={tone.fg} label={`${labelOfMime(mime)} share of storage`} />
    </View>
  );
}

export default function StorageUsage() {
  const theme = useTheme();
  const online = useIsOnline();
  const local = useLocalStorageUsage();
  const remote = useRemoteStorageUsage();
  const used = remote.data?.used ?? local.data?.bytes ?? 0;
  const quota = remote.data?.quota ?? 1024 ** 3;

  return (
    <Screen title="Storage" back>
      <View style={{ gap: theme.spacing.xl }}>
        {!online ? <OfflineNotice message="Showing what this device knows. Connect to see your exact cloud usage." /> : null}
        <Card elevated tone="raised" style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <ProgressRing value={used / quota} size={104} label={`${Math.round((used / quota) * 100)}%`} sublabel="used" color={used / quota > 0.9 ? theme.colors.danger : theme.colors.primary} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="heading">{formatBytes(used)}</AppText>
            <AppText color="textMuted" variant="label">
              of {formatBytes(quota)} vault storage
            </AppText>
            <AppText variant="caption" color="textSubtle">
              {(remote.data?.count ?? local.data?.count ?? 0).toString()} documents
            </AppText>
          </View>
        </Card>
        <RowGroup title="On this device">
          <ListRow icon={CloudDownload} title={`${local.data?.offlineCount ?? 0} offline documents`} subtitle={formatBytes(local.data?.offlineBytes ?? 0)} onPress={() => router.push('/documents/offline')} />
          <ListRow icon={HardDrive} title="Local database & cache" subtitle="Tasks and document details for offline use" />
        </RowGroup>
        {(local.data?.byKind.length ?? 0) > 0 ? (
          <Card style={{ gap: 14 }}>
            <AppText variant="heading">By type</AppText>
            {local.data!.byKind.map((k) => (
              <KindRow key={k.mime} {...k} total={local.data!.bytes} />
            ))}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
