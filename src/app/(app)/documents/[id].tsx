import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { CloudDownload, CloudOff, Eye, FileCheck2, Folder, HardDrive, Lock, MoreHorizontal, Share2, ShieldCheck, Star } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, IconButton, ListRow, OfflineNotice, ProgressBar, RowGroup, Screen, SkeletonList, toast } from '@/components';
import { DocumentActions, shareDoc, toggleOffline } from '@/features/documents/components/DocumentActions';
import { DocIcon } from '@/features/documents/components/DocumentRow';
import { parseCsv } from '@/features/documents/csv';
import { kindOfMime, labelOfMime } from '@/features/documents/fileTypes';
import { openPlaintext, previewDocument } from '@/features/documents/vaultService';
import { withLockSuspended } from '@/features/security/appLock';
import { requestSync } from '@/features/sync/syncService';
import { useDocument, useFolderPath } from '@/hooks/queries';
import { formatBytes } from '@/lib/bytes';
import { userMessageOf } from '@/lib/errors';
import { formatDateTime } from '@/lib/time';
import { documentRepository } from '@/repositories/documentRepository';
import { useIsOnline } from '@/stores/networkStore';
import { useTransferStore } from '@/stores/transferStore';
import { useTheme } from '@/theme';
import type { LocalDocument } from '@/types/domain';

const MAX_TEXT_PREVIEW = 256 * 1024;

type Inline = { kind: 'image'; uri: string } | { kind: 'text'; text: string } | { kind: 'csv'; rows: string[][] };

function InlinePreview({ doc }: { doc: LocalDocument }) {
  const theme = useTheme();
  const online = useIsOnline();
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; inline?: Inline; error?: string }>({ status: 'idle' });
  const release = useRef<(() => void) | null>(null);
  const kind = kindOfMime(doc.mime_type);
  const canInline = (kind === 'image' && doc.mime_type !== 'image/heic') || kind === 'text' || kind === 'csv';
  const reachable = doc.offline_status === 'available' || !!doc.local_staged_path || online;

  useEffect(() => () => release.current?.(), []);

  type Result = { status: 'ready'; inline: Inline } | { status: 'error'; error: string };
  const fetchInline = async (): Promise<Result> => {
    try {
      const opened = await openPlaintext(doc, kind === 'image' ? 'preview.img' : 'preview.txt');
      release.current?.();
      release.current = opened.release;
      if (kind === 'image') return { status: 'ready', inline: { kind: 'image', uri: opened.file.uri } };
      const text = (await opened.file.text()).slice(0, MAX_TEXT_PREVIEW);
      return { status: 'ready', inline: kind === 'csv' ? { kind: 'csv', rows: parseCsv(text) } : { kind: 'text', text } };
    } catch (e) {
      return { status: 'error', error: userMessageOf(e) };
    }
  };

  const load = () => {
    setState({ status: 'loading' });
    void fetchInline().then((r) => setState(r));
  };

  const autoLoad = canInline && reachable && doc.size_bytes <= 15 * 1024 * 1024;
  useEffect(() => {
    if (!autoLoad) return;
    let alive = true;
    void fetchInline().then((r) => {
      if (alive) setState(r);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.offline_status, autoLoad]);

  if (!canInline) return null;
  if (!reachable) return <OfflineNotice message="Preview unavailable offline. Download this document while online to view it anywhere." />;
  if (state.status === 'idle' && !autoLoad)
    return (
      <Card tone="sunken" style={styles.previewBox}>
        <AppText variant="caption" color="textMuted">
          Large file — preview on demand.
        </AppText>
        <Button label="Show preview" size="sm" variant="secondary" onPress={load} />
      </Card>
    );
  if (state.status === 'loading' || state.status === 'idle')
    return (
      <Card tone="sunken" style={styles.previewBox}>
        <ActivityIndicator color={theme.colors.primary} />
        <AppText variant="caption" color="textMuted">
          Decrypting preview…
        </AppText>
      </Card>
    );
  if (state.status === 'error')
    return (
      <Card tone="sunken" style={styles.previewBox}>
        <AppText color="danger" align="center">
          {state.error}
        </AppText>
        <Button label="Try again" size="sm" variant="secondary" onPress={load} />
      </Card>
    );
  const inline = state.inline!;
  if (inline.kind === 'image')
    return (
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Image source={{ uri: inline.uri }} style={{ width: '100%', aspectRatio: 4 / 3 }} contentFit="contain" accessibilityLabel={`Preview of ${doc.name}`} cachePolicy="none" />
      </Card>
    );
  if (inline.kind === 'text')
    return (
      <Card tone="sunken" style={{ maxHeight: 360 }}>
        <ScrollView nestedScrollEnabled>
          <AppText selectable style={{ fontFamily: undefined, fontSize: 13, lineHeight: 19 }}>
            {inline.text}
          </AppText>
        </ScrollView>
      </Card>
    );
  return (
    <Card tone="sunken" style={{ padding: 0, maxHeight: 360 }}>
      <ScrollView horizontal nestedScrollEnabled>
        <ScrollView nestedScrollEnabled>
          {inline.rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border, backgroundColor: i === 0 ? theme.colors.surface : undefined }}>
              {r.map((c, j) => (
                <AppText key={j} variant={i === 0 ? 'label' : 'caption'} numberOfLines={2} style={{ width: 120, padding: 8 }}>
                  {c}
                </AppText>
              ))}
            </View>
          ))}
        </ScrollView>
      </ScrollView>
    </Card>
  );
}

export default function DocumentDetails() {
  const theme = useTheme();
  const online = useIsOnline();
  const { id } = useLocalSearchParams<{ id: string }>();
  const doc = useDocument(id);
  const path = useFolderPath(doc.data?.folder_id ?? null);
  const transfer = useTransferStore((s) => (id ? s.transfers[id] : undefined));
  const [menu, setMenu] = useState(false);
  const [opening, setOpening] = useState(false);

  if (doc.isLoading)
    return (
      <Screen back>
        <SkeletonList rows={3} />
      </Screen>
    );
  const d = doc.data;
  if (!d)
    return (
      <Screen back>
        <EmptyState title="Document not found" body="It may have been deleted on another device." mood="error" actionLabel="Back to vault" onAction={() => router.replace('/documents')} />
      </Screen>
    );

  const available = d.offline_status === 'available' || !!d.local_staged_path;
  const open = async () => {
    if (!available && !online) {
      toast.error('Download this document for offline use to open it without a connection.');
      return;
    }
    setOpening(true);
    try {
      const handle = await withLockSuspended(() => previewDocument(d));
      // The system viewer has read the file once preview()/share resolves.
      setTimeout(() => handle?.release(), 30_000);
    } catch (e) {
      toast.error(e);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Screen
      back
      right={
        <View style={{ flexDirection: 'row' }}>
          <IconButton
            icon={Star}
            label={d.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            tone={d.is_favorite ? 'primary' : 'default'}
            onPress={() => documentRepository.setFavorite(d.id, !d.is_favorite).then(() => requestSync('fav')).catch(toast.error)}
          />
          <IconButton icon={MoreHorizontal} label="More actions" onPress={() => setMenu(true)} />
        </View>
      }
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Open" icon={Eye} size="lg" loading={opening} style={{ flex: 1 }} onPress={open} disabled={d.upload_status !== 'uploaded' && !d.local_staged_path} />
          <Button label="Share" icon={Share2} size="lg" variant="secondary" onPress={() => void shareDoc(d, online)} />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <DocIcon mime={d.mime_type} size={56} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading" accessibilityRole="header" numberOfLines={3} selectable>
              {d.name}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {labelOfMime(d.mime_type)} · {formatBytes(d.size_bytes)}
            </AppText>
          </View>
        </View>

        {transfer ? (
          <View style={{ gap: 4 }}>
            <ProgressBar value={transfer.fraction} label={`${transfer.kind} progress`} />
            <AppText variant="caption" color="textMuted">
              {transfer.kind} {Math.round(transfer.fraction * 100)}%
            </AppText>
          </View>
        ) : null}

        <InlinePreview doc={d} />

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {d.offline_status === 'available' ? <CloudDownload size={22} color={theme.colors.success} /> : <CloudOff size={22} color={theme.colors.textMuted} />}
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{d.offline_status === 'available' ? 'Available offline' : d.offline_status === 'downloading' ? 'Downloading…' : 'Online only'}</AppText>
            <AppText variant="caption" color="textMuted">
              {d.offline_status === 'available' ? `Encrypted on this device · ${formatBytes(d.offline_size_bytes ?? d.size_bytes)}` : 'Download to open without a connection'}
            </AppText>
          </View>
          <Button
            label={d.offline_status === 'available' ? 'Remove' : 'Download'}
            size="sm"
            variant={d.offline_status === 'available' ? 'ghost' : 'soft'}
            loading={d.offline_status === 'downloading'}
            disabled={d.upload_status !== 'uploaded'}
            onPress={() => void toggleOffline(d, online)}
          />
        </Card>

        <RowGroup title="Details">
          <ListRow icon={Folder} title={path.data?.length ? path.data.map((p) => p.name).join(' / ') : 'Vault (top level)'} subtitle="Location" />
          <ListRow
            icon={d.encryption_mode === 'e2ee' ? Lock : ShieldCheck}
            title={d.encryption_mode === 'e2ee' ? 'End-to-end encrypted' : 'Private cloud storage'}
            subtitle={d.encryption_mode === 'e2ee' ? 'Only your vault passphrase can decrypt this file' : 'Accessible only to your account'}
          />
          <ListRow icon={FileCheck2} title={d.checksum_sha256 ? 'Integrity checked' : 'No checksum'} subtitle={d.checksum_sha256 ? `SHA-256 ${d.checksum_sha256.slice(0, 16)}…` : undefined} />
          <ListRow
            icon={HardDrive}
            title={d.upload_status === 'uploaded' ? 'Uploaded' : d.upload_status === 'failed' ? 'Upload failed' : 'Waiting to upload'}
            subtitle={d.upload_error ?? `Added ${formatDateTime(d.created_at)} · Modified ${formatDateTime(d.client_updated_at)}`}
          />
        </RowGroup>
      </View>
      <DocumentActions doc={menu ? d : null} onClose={() => setMenu(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  previewBox: { alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 160 },
});
