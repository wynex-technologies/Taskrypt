import { CloudOff, Trash2 } from 'lucide-react-native';
import { Alert, View } from 'react-native';

import { AppText, Button, Card, EmptyState, Screen, SkeletonList, toast } from '@/components';
import { DocumentRow } from '@/features/documents/components/DocumentRow';
import { removeOfflineCopy } from '@/features/documents/vaultService';
import { useDocuments } from '@/hooks/queries';
import { formatBytes } from '@/lib/bytes';
import { useTheme } from '@/theme';

export default function OfflineDownloads() {
  const theme = useTheme();
  const docs = useDocuments({ folderId: 'all', offlineOnly: true, sort: 'name', direction: 'asc' });
  const list = docs.data ?? [];
  const total = list.reduce((a, d) => a + (d.offline_size_bytes ?? d.size_bytes), 0);

  const removeAll = () =>
    Alert.alert('Remove all offline copies?', 'Documents stay in your vault. They will need a connection to open.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            for (const d of list) await removeOfflineCopy(d);
            toast.success('Offline copies removed');
          } catch (e) {
            toast.error(e);
          }
        },
      },
    ]);

  return (
    <Screen title="Offline downloads" subtitle="Encrypted copies stored only on this device." back>
      {docs.isLoading ? (
        <SkeletonList />
      ) : list.length === 0 ? (
        <EmptyState title="No offline documents" body="Open a document and choose Download to keep an encrypted copy for offline use." mood="offline" />
      ) : (
        <View style={{ gap: theme.spacing.lg }}>
          <Card tone="sunken" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <CloudOff size={20} color={theme.colors.textMuted} />
            <AppText style={{ flex: 1 }}>
              {list.length} document{list.length === 1 ? '' : 's'} · {formatBytes(total)}
            </AppText>
            <Button label="Remove all" size="sm" variant="ghost" icon={Trash2} onPress={removeAll} />
          </Card>
          <Card style={{ paddingVertical: 4 }}>
            {list.map((d) => (
              <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <DocumentRow doc={d} />
                </View>
                <Button label="Remove" size="sm" variant="ghost" onPress={() => removeOfflineCopy(d).catch(toast.error)} />
              </View>
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}
