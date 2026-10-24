import { router } from 'expo-router';
import { ArrowUpDown, ChevronRight, CloudDownload, Folder, FolderPlus, HardDrive, MoreHorizontal, Pencil, Search, Star, Trash2, Upload, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Button, Card, Chip, ChipRow, CONTENT_MAX_WIDTH, EmptyState, ErrorState, Fab, IconButton, ListRow, RowGroup, ScalePressable, Sheet, SkeletonList, TextField, toast } from '@/components';
import { requestSync } from '@/features/sync/syncService';
import { useDocuments, useFolderCounts, useFolderPath, useFolders } from '@/hooks/queries';
import { FOLDER_COLORS, folderRepository, type DocumentSort } from '@/repositories/documentRepository';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';
import type { LocalDocument, LocalFolder } from '@/types/domain';

import { FILE_TYPES, type FileKind } from '../fileTypes';
import { deleteDocuments } from '../vaultService';

import { DocumentActions } from './DocumentActions';
import { DocumentRow } from './DocumentRow';
import { FolderPicker } from './FolderPicker';

type Scope = 'folder' | 'favorites' | 'offline';

const TYPE_FILTERS: { label: string; kinds: FileKind[] }[] = [
  { label: 'PDF', kinds: ['pdf'] },
  { label: 'Docs', kinds: ['word', 'rtf', 'text'] },
  { label: 'Sheets', kinds: ['excel', 'csv'] },
  { label: 'Slides', kinds: ['powerpoint'] },
  { label: 'Images', kinds: ['image'] },
];

const mimesFor = (kinds: FileKind[]) => [...new Set(Object.values(FILE_TYPES).filter((t) => kinds.includes(t.kind)).map((t) => t.mime))];

export function VaultBrowser({ folderId }: { folderId: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const online = useIsOnline();
  const [scope, setScope] = useState<Scope>('folder');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [typeIdx, setTypeIdx] = useState<number | null>(null);
  const [sort, setSort] = useState<DocumentSort>('date');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [sortOpen, setSortOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<LocalDocument | null>(null);
  const [folderSheet, setFolderSheet] = useState<{ mode: 'create' | 'rename'; folder?: LocalFolder } | null>(null);
  const [folderMenu, setFolderMenu] = useState<LocalFolder | null>(null);
  const [movingFolder, setMovingFolder] = useState<LocalFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]!);

  const searching = search.trim().length > 0;
  const filter = useMemo(
    () => ({
      folderId: searching || scope !== 'folder' ? ('all' as const) : folderId,
      search,
      favoritesOnly: scope === 'favorites',
      offlineOnly: scope === 'offline',
      mimeTypes: typeIdx === null ? undefined : mimesFor(TYPE_FILTERS[typeIdx]!.kinds),
      sort,
      direction: dir,
    }),
    [searching, scope, folderId, search, typeIdx, sort, dir],
  );
  const docs = useDocuments(filter);
  const folders = useFolders(folderId);
  const counts = useFolderCounts();
  const path = useFolderPath(folderId);
  const current = path.data?.[path.data.length - 1];
  const showFolders = scope === 'folder' && !searching && typeIdx === null;
  const columns = width >= 700 ? 4 : 2;

  const saveFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    try {
      if (folderSheet?.mode === 'rename' && folderSheet.folder) await folderRepository.rename(folderSheet.folder.id, name);
      else await folderRepository.create(name, folderId, folderColor);
      requestSync('folder');
      setFolderSheet(null);
    } catch (e) {
      toast.error(e);
    }
  };

  const deleteFolder = (f: LocalFolder) =>
    Alert.alert('Delete folder?', `“${f.name}”, its sub-folders and every document inside will be deleted from all devices.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const removed = await folderRepository.remove(f.id);
            await deleteDocuments(removed);
            requestSync('folder-delete', 300);
            toast.success('Folder deleted');
          } catch (e) {
            toast.error(e);
          }
        },
      },
    ]);

  const header = (
    <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="title" accessibilityRole="header" numberOfLines={1}>
            {current?.name ?? 'Vault'}
          </AppText>
          {!folderId ? (
            <AppText variant="caption" color="textMuted">
              Private, encrypted documents
            </AppText>
          ) : null}
        </View>
        <IconButton icon={searchOpen ? X : Search} label={searchOpen ? 'Close search' : 'Search documents'} onPress={() => { setSearchOpen((o) => !o); setSearch(''); }} />
        <IconButton icon={ArrowUpDown} label="Sort documents" onPress={() => setSortOpen(true)} />
        {!folderId ? <IconButton icon={HardDrive} label="Storage usage" onPress={() => router.push('/documents/storage')} /> : null}
      </View>
      {folderId && path.data ? (
        <ChipRow>
          <Chip label="Vault" onPress={() => router.dismissTo('/documents')} />
          {path.data.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ChevronRight size={14} color={theme.colors.textSubtle} />
              <Chip label={p.name} selected={i === path.data!.length - 1} onPress={() => (i === path.data!.length - 1 ? undefined : router.push({ pathname: '/documents/folder/[id]', params: { id: p.id } }))} />
            </View>
          ))}
        </ChipRow>
      ) : null}
      {searchOpen ? <TextField icon={Search} placeholder="Search by file name" value={search} onChangeText={setSearch} autoFocus returnKeyType="search" accessibilityLabel="Search documents" /> : null}
      {!folderId ? (
        <ChipRow>
          <Chip label="Folders" selected={scope === 'folder'} onPress={() => setScope('folder')} />
          <Chip label="Favorites" icon={Star} selected={scope === 'favorites'} onPress={() => setScope('favorites')} />
          <Chip label="Offline" icon={CloudDownload} selected={scope === 'offline'} onPress={() => setScope('offline')} />
        </ChipRow>
      ) : null}
      <ChipRow>
        {TYPE_FILTERS.map((t, i) => (
          <Chip key={t.label} label={t.label} selected={typeIdx === i} onPress={() => setTypeIdx(typeIdx === i ? null : i)} />
        ))}
      </ChipRow>
      {showFolders && (folders.data?.length ?? 0) > 0 ? (
        <View style={styles.folderGrid}>
          {folders.data!.map((f) => (
            <ScalePressable
              key={f.id}
              onPress={() => router.push({ pathname: '/documents/folder/[id]', params: { id: f.id } })}
              onLongPress={() => setFolderMenu(f)}
              accessibilityRole="button"
              accessibilityLabel={`Folder ${f.name}, ${counts.data?.get(f.id) ?? 0} documents`}
              accessibilityHint="Long press for folder options"
              style={[styles.folder, { width: `${100 / columns - 2}%`, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg }]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Folder size={26} color={f.color} fill={f.color} fillOpacity={0.18} />
                <IconButton icon={MoreHorizontal} label={`Options for ${f.name}`} size={18} onPress={() => setFolderMenu(f)} style={{ width: 32, height: 32, marginTop: -6, marginRight: -6 }} />
              </View>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {f.name}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {counts.data?.get(f.id) ?? 0} files
              </AppText>
            </ScalePressable>
          ))}
        </View>
      ) : null}
      {(docs.data?.length ?? 0) > 0 ? (
        <AppText variant="overline" color="textMuted">
          {searching ? 'Results' : 'Documents'}
        </AppText>
      ) : null}
    </View>
  );

  const nothing = (docs.data?.length ?? 0) === 0 && (!showFolders || (folders.data?.length ?? 0) === 0);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: folderId ? 0 : insets.top }}>
      <FlatList
        data={docs.data ?? []}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 140, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginLeft: 58 }} />}
        renderItem={({ item }) => <DocumentRow doc={item} onLongPress={() => setActionsFor(item)} />}
        ListEmptyComponent={
          docs.isLoading ? (
            <SkeletonList />
          ) : docs.error ? (
            <ErrorState error={docs.error} onRetry={() => void docs.refetch()} />
          ) : nothing ? (
            searching || typeIdx !== null ? (
              <EmptyState title="No matching documents" body="Try another name or type." mood="idle" />
            ) : scope === 'favorites' ? (
              <EmptyState title="No favorites yet" body="Star documents you open often." mood="idle" />
            ) : scope === 'offline' ? (
              <EmptyState title="Nothing downloaded" body="Make documents available offline to open them without a connection." mood={online ? 'idle' : 'offline'} />
            ) : (
              <EmptyState
                title={folderId ? 'This folder is empty' : 'Your vault is empty'}
                body="Upload PDFs, Office files, images and more. They are stored privately and encrypted on your devices."
                mood="documentSaved"
                actionLabel="Upload a document"
                onAction={() => router.push({ pathname: '/documents/upload', params: folderId ? { folderId } : {} })}
              />
            )
          ) : undefined
        }
        ListFooterComponent={
          showFolders ? (
            <Button
              label="New folder"
              icon={FolderPlus}
              variant="secondary"
              style={{ marginTop: 20 }}
              onPress={() => {
                setFolderName('');
                setFolderSheet({ mode: 'create' });
              }}
            />
          ) : undefined
        }
      />
      <Fab icon={Upload} label="Upload document" onPress={() => router.push({ pathname: '/documents/upload', params: folderId ? { folderId } : {} })} bottomOffset={folderId ? 0 : 8} />

      <DocumentActions doc={actionsFor} onClose={() => setActionsFor(null)} />

      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort documents">
        {([
          ['date', 'desc', 'Newest first'],
          ['date', 'asc', 'Oldest first'],
          ['name', 'asc', 'Name A–Z'],
          ['name', 'desc', 'Name Z–A'],
          ['size', 'desc', 'Largest first'],
          ['size', 'asc', 'Smallest first'],
        ] as const).map(([s, d, label]) => (
          <Chip
            key={label}
            label={label}
            selected={sort === s && dir === d}
            onPress={() => {
              setSort(s);
              setDir(d);
              setSortOpen(false);
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={!!folderSheet} onClose={() => setFolderSheet(null)} title={folderSheet?.mode === 'rename' ? 'Rename folder' : 'New folder'}>
        <TextField label="Folder name" value={folderName} onChangeText={setFolderName} autoFocus maxLength={80} onSubmitEditing={saveFolder} />
        {folderSheet?.mode === 'create' ? (
          <ChipRow>
            {FOLDER_COLORS.map((c) => (
              <Chip key={c} label=" " color={c} selected={folderColor === c} onPress={() => setFolderColor(c)} accessibilityLabel={`Folder color ${c}`} />
            ))}
          </ChipRow>
        ) : null}
        <Button label="Save" fullWidth onPress={saveFolder} disabled={!folderName.trim()} />
      </Sheet>

      <Sheet visible={!!folderMenu} onClose={() => setFolderMenu(null)} title={folderMenu?.name}>
        <RowGroup>
          <ListRow
            icon={Pencil}
            title="Rename"
            chevron={false}
            onPress={() => {
              setFolderName(folderMenu!.name);
              setFolderSheet({ mode: 'rename', folder: folderMenu! });
              setFolderMenu(null);
            }}
          />
          <ListRow
            icon={Folder}
            title="Move"
            chevron={false}
            onPress={() => {
              setMovingFolder(folderMenu);
              setFolderMenu(null);
            }}
          />
          <ListRow
            icon={Trash2}
            title="Delete folder"
            destructive
            chevron={false}
            onPress={() => {
              const f = folderMenu!;
              setFolderMenu(null);
              deleteFolder(f);
            }}
          />
        </RowGroup>
      </Sheet>
      <FolderPicker
        visible={!!movingFolder}
        title="Move folder to…"
        excludeId={movingFolder?.id}
        currentId={movingFolder?.parent_id}
        onClose={() => setMovingFolder(null)}
        onPick={(dest) => {
          const f = movingFolder!;
          setMovingFolder(null);
          folderRepository
            .move(f.id, dest)
            .then(() => {
              requestSync('folder-move');
              toast.success('Folder moved');
            })
            .catch(toast.error);
        }}
      />
      {!online && !folderId ? (
        <Card tone="sunken" style={[styles.offline, { bottom: 96 + insets.bottom }]}>
          <AppText variant="caption" color="textMuted">
            Offline: you can browse everything and open downloaded documents. Uploads wait until you reconnect.
          </AppText>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  folderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
  folder: { padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth, flexGrow: 1 },
  offline: { position: 'absolute', left: 16, right: 96, padding: 12 },
});
