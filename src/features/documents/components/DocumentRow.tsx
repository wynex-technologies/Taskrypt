import { router } from 'expo-router';
import { CircleAlert, CloudUpload, CloudDownload, File, FileArchive, FileImage, FileSpreadsheet, FileText, Lock, Presentation, Star, type LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, ProgressBar, ScalePressable } from '@/components';
import { formatBytes } from '@/lib/bytes';
import { relativeTime } from '@/lib/time';
import { useTransferStore } from '@/stores/transferStore';
import { useTheme } from '@/theme';
import type { LocalDocument } from '@/types/domain';

import { kindOfMime, labelOfMime, type FileKind } from '../fileTypes';

const ICONS: Record<FileKind, LucideIcon> = {
  pdf: FileText,
  word: FileText,
  excel: FileSpreadsheet,
  powerpoint: Presentation,
  text: FileText,
  csv: FileSpreadsheet,
  image: FileImage,
  rtf: FileText,
  archive: FileArchive,
};

export function useKindColor(kind: FileKind | null) {
  const { colors } = useTheme();
  switch (kind) {
    case 'pdf':
      return { fg: colors.danger, bg: colors.dangerSoft };
    case 'word':
    case 'rtf':
      return { fg: colors.info, bg: colors.infoSoft };
    case 'excel':
    case 'csv':
      return { fg: colors.success, bg: colors.successSoft };
    case 'powerpoint':
      return { fg: colors.primary, bg: colors.primarySoft };
    case 'image':
      return { fg: colors.accentPlum, bg: colors.accentPlumSoft };
    default:
      return { fg: colors.textMuted, bg: colors.surfaceSunken };
  }
}

export function DocIcon({ mime, size = 40 }: { mime: string; size?: number }) {
  const kind = kindOfMime(mime);
  const tone = useKindColor(kind);
  const Icon = kind ? ICONS[kind] : File;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.5} color={tone.fg} />
    </View>
  );
}

export const DocumentRow = memo(function DocumentRow({ doc, compact, onPress, onLongPress }: { doc: LocalDocument; compact?: boolean; onPress?: () => void; onLongPress?: () => void }) {
  const theme = useTheme();
  const transfer = useTransferStore((s) => s.transfers[doc.id]);
  const uploading = doc.upload_status === 'pending' || doc.upload_status === 'uploading';
  const failed = doc.upload_status === 'failed';
  const meta = [labelOfMime(doc.mime_type), formatBytes(doc.size_bytes), relativeTime(doc.client_updated_at)].join(' · ');
  const status = failed ? 'Upload failed' : uploading ? 'Waiting to upload' : doc.offline_status === 'available' ? 'Available offline' : null;

  return (
    <ScalePressable
      onPress={onPress ?? (() => router.push({ pathname: '/documents/[id]', params: { id: doc.id } }))}
      onLongPress={onLongPress}
      pressedScale={0.99}
      accessibilityRole="button"
      accessibilityLabel={`${doc.name}. ${meta}${status ? `. ${status}` : ''}${doc.is_favorite ? '. Favorite' : ''}`}
      accessibilityHint="Opens document details"
      style={[styles.row, { paddingVertical: compact ? 10 : 12, paddingHorizontal: compact ? 14 : 4 }]}
    >
      <DocIcon mime={doc.mime_type} size={compact ? 36 : 42} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {doc.name}
        </AppText>
        <View style={styles.meta}>
          {doc.encryption_mode === 'e2ee' ? <Lock size={12} color={theme.colors.accentPlum} /> : null}
          <AppText variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {meta}
          </AppText>
        </View>
        {transfer ? (
          <View style={{ gap: 3 }}>
            <ProgressBar value={transfer.fraction} height={4} label={`${transfer.kind} ${Math.round(transfer.fraction * 100)} percent`} />
            <AppText variant="caption" color="textSubtle">
              {transfer.kind === 'uploading' ? 'Uploading' : transfer.kind === 'downloading' ? 'Downloading' : transfer.kind === 'encrypting' ? 'Encrypting' : 'Decrypting'} {Math.round(transfer.fraction * 100)}%
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.badges}>
        {doc.is_favorite ? <Star size={16} color={theme.colors.warning} fill={theme.colors.warning} /> : null}
        {failed ? <CircleAlert size={16} color={theme.colors.danger} /> : uploading ? <CloudUpload size={16} color={theme.colors.textSubtle} /> : null}
        {doc.offline_status === 'available' ? <CloudDownload size={16} color={theme.colors.success} /> : null}
      </View>
    </ScalePressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
