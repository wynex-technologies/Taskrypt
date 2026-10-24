import { router, useLocalSearchParams } from 'expo-router';
import { CircleAlert, CircleCheck, FilePlus, FolderOpen, Lock, RefreshCw, ShieldCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Button, Card, ListRow, OfflineNotice, ProgressBar, RowGroup, Screen, toast } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { mascot } from '@/features/animation/mascotStore';
import { DocIcon } from '@/features/documents/components/DocumentRow';
import { FolderPicker } from '@/features/documents/components/FolderPicker';
import { ALLOWED_MIME_TYPES } from '@/features/documents/fileTypes';
import { cancelUpload, pickAndImport, retryUpload, type ImportResult } from '@/features/documents/vaultService';
import { withLockSuspended } from '@/features/security/appLock';
import { requestSync, syncNow } from '@/features/sync/syncService';
import { useDocuments, useFolderPath } from '@/hooks/queries';
import { formatBytes } from '@/lib/bytes';
import { env } from '@/lib/env';
import { isUuid } from '@/lib/ids';
import { useIsOnline } from '@/stores/networkStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTransferStore } from '@/stores/transferStore';
import { useTheme } from '@/theme';

export default function Upload() {
  const theme = useTheme();
  const online = useIsOnline();
  const params = useLocalSearchParams<{ folderId?: string }>();
  const [folderId, setFolderId] = useState<string | null>(isUuid(params.folderId) ? params.folderId : null);
  const [picking, setPicking] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const path = useFolderPath(folderId);
  const e2ee = usePreferencesStore((s) => s.e2eeEnabled);
  const transfers = useTransferStore((s) => s.transfers);
  // Everything this session imported, plus anything still waiting from before.
  const all = useDocuments({ folderId: 'all', sort: 'date', direction: 'desc', limit: 200 });
  const queued = (all.data ?? []).filter((d) => d.upload_status !== 'uploaded');

  const pick = async () => {
    setPicking(true);
    try {
      const r = await withLockSuspended(() => pickAndImport(folderId));
      if (r.cancelled) return;
      setResult(r);
      if (r.imported.length) {
        mascot.react('documentSaved');
        if (online) requestSync('upload', 200);
      }
      if (r.rejected.length && !r.imported.length) mascot.react('error');
    } catch (e) {
      mascot.react('error');
      toast.error(e);
    } finally {
      setPicking(false);
    }
  };

  const folderName = path.data?.length ? path.data.map((p) => p.name).join(' / ') : 'Vault (top level)';

  return (
    <Screen title="Add documents" back>
      <View style={{ gap: theme.spacing.xl }}>
        <Card elevated tone="raised" style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
          <Mascot size={96} ambient={picking ? 'loading' : undefined} />
          <AppText variant="heading" align="center">
            Choose files to add
          </AppText>
          <AppText color="textMuted" align="center" variant="label">
            PDF, Word, Excel, PowerPoint, text, CSV, JPG, PNG and more — up to {env.maxUploadMb} MB each.
          </AppText>
          <Button label={picking ? 'Preparing…' : 'Browse files'} icon={FilePlus} size="lg" loading={picking} onPress={pick} testID="pick-files" />
        </Card>

        {!online ? <OfflineNotice message="You are offline. Files are encrypted and saved on this device now, and upload automatically when you reconnect." /> : null}

        <RowGroup title="Destination">
          <ListRow icon={FolderOpen} title={folderName} subtitle="Tap to change folder" onPress={() => setPickerOpen(true)} />
        </RowGroup>

        <Card tone="sunken" style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {e2ee ? <Lock size={16} color={theme.colors.accentPlum} /> : <ShieldCheck size={16} color={theme.colors.success} />}
            <AppText variant="label">{e2ee ? 'End-to-end encrypted uploads are on' : 'Private cloud storage'}</AppText>
          </View>
          <AppText variant="caption" color="textMuted">
            {e2ee
              ? 'Files are encrypted on this phone before upload. Only your vault passphrase can decrypt them.'
              : 'Files go to a private bucket only your account can access, over TLS. Local copies are AES-256 encrypted on this device.'}{' '}
            File contents are checked — a renamed file of another type is rejected.
          </AppText>
        </Card>

        {result ? (
          <View style={{ gap: 10 }}>
            {result.imported.length ? (
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <CircleCheck size={18} color={theme.colors.success} />
                <AppText variant="label">
                  {result.imported.length} file{result.imported.length === 1 ? '' : 's'} added
                </AppText>
              </View>
            ) : null}
            {result.rejected.map((r) => (
              <Card key={r.name} tone="sunken" style={{ flexDirection: 'row', gap: 10 }}>
                <CircleAlert size={18} color={theme.colors.danger} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label" numberOfLines={1}>
                    {r.name}
                  </AppText>
                  <AppText variant="caption" color="danger">
                    {r.reason}
                  </AppText>
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {queued.length ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="heading">Upload queue</AppText>
              {online ? <Button label="Upload now" size="sm" variant="ghost" icon={RefreshCw} onPress={() => void syncNow('manual')} /> : null}
            </View>
            {queued.map((d) => {
              const t = transfers[d.id];
              const failed = d.upload_status === 'failed';
              return (
                <Card key={d.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <DocIcon mime={d.mime_type} size={36} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="bodyStrong" numberOfLines={1}>
                        {d.name}
                      </AppText>
                      <AppText variant="caption" color={failed ? 'danger' : 'textMuted'}>
                        {failed ? d.upload_error ?? 'Upload failed' : t ? `${t.kind === 'uploading' ? 'Uploading' : 'Preparing'} ${Math.round(t.fraction * 100)}%` : online ? 'Queued' : 'Waiting for connection'} · {formatBytes(d.size_bytes)}
                      </AppText>
                    </View>
                    {failed ? (
                      <Button label="Retry" size="sm" variant="soft" icon={RefreshCw} onPress={() => retryUpload(d.id).then(() => requestSync('retry', 100)).catch(toast.error)} />
                    ) : (
                      <Button label="Cancel" size="sm" variant="ghost" icon={X} onPress={() => cancelUpload(d.id)} />
                    )}
                  </View>
                  {t ? <ProgressBar value={t.fraction} height={5} label={`${d.name} upload progress`} /> : null}
                </Card>
              );
            })}
          </View>
        ) : null}

        <Button label="Done" variant="secondary" fullWidth onPress={() => router.back()} />
        <AppText variant="caption" color="textSubtle" align="center">
          Supported: {ALLOWED_MIME_TYPES.length} document types
        </AppText>
      </View>
      <FolderPicker
        visible={pickerOpen}
        title="Save into…"
        currentId={folderId}
        onClose={() => setPickerOpen(false)}
        onPick={(f) => {
          setFolderId(f);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}
