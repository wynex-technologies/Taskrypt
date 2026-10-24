import { router } from 'expo-router';
import { CloudDownload, CloudOff, Copy, FolderInput, Pencil, Share2, Star, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, ListRow, RowGroup, Sheet, TextField, toast } from '@/components';
import { mascot } from '@/features/animation/mascotStore';
import { withLockSuspended } from '@/features/security/appLock';
import { requestSync } from '@/features/sync/syncService';
import { documentRepository } from '@/repositories/documentRepository';
import { useIsOnline } from '@/stores/networkStore';
import type { LocalDocument } from '@/types/domain';

import { sanitizeFilename } from '../fileTypes';
import { copyDocument, deleteDocuments, makeAvailableOffline, removeOfflineCopy, shareDocument } from '../vaultService';

import { FolderPicker } from './FolderPicker';

export function confirmDeleteDocuments(docs: LocalDocument[], after?: () => void) {
  const label = docs.length === 1 ? `“${docs[0]!.name}”` : `${docs.length} documents`;
  Alert.alert('Delete permanently?', `${label} will be removed from your vault and every device, including offline copies.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () =>
        deleteDocuments(docs)
          .then(() => {
            toast.success(docs.length === 1 ? 'Document deleted' : 'Documents deleted');
            requestSync('doc-delete', 300);
            after?.();
          })
          .catch(toast.error),
    },
  ]);
}

/** Offline toggle shared by details and the actions sheet. */
export async function toggleOffline(doc: LocalDocument, online: boolean) {
  if (doc.offline_status === 'available') {
    await removeOfflineCopy(doc);
    toast.info('Offline copy removed from this device');
    return;
  }
  if (!online) {
    toast.error('Connect to the internet to download this document.');
    return;
  }
  try {
    await makeAvailableOffline(doc);
    mascot.react('documentSaved');
    toast.success('Available offline — encrypted on this device');
  } catch (e) {
    toast.error(e);
  }
}

export async function shareDoc(doc: LocalDocument, online: boolean) {
  if (doc.offline_status !== 'available' && !doc.local_staged_path && !online) {
    toast.error('Download this document for offline use to share it without a connection.');
    return;
  }
  await withLockSuspended(() => shareDocument(doc)).catch(toast.error);
}

type Props = { doc: LocalDocument | null; onClose: () => void };

export function DocumentActions({ doc, onClose }: Props) {
  const online = useIsOnline();
  const [mode, setMode] = useState<'menu' | 'rename' | 'move' | 'copy'>('menu');
  const [name, setName] = useState('');

  const close = () => {
    setMode('menu');
    onClose();
  };
  if (!doc) return null;

  const rename = async () => {
    const clean = sanitizeFilename(name);
    if (!clean.trim()) return;
    try {
      await documentRepository.rename(doc.id, clean);
      requestSync('doc-rename');
      toast.success('Renamed');
      close();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <Sheet visible={mode === 'menu' || mode === 'rename'} onClose={close} title={mode === 'rename' ? 'Rename' : doc.name}>
        {mode === 'rename' ? (
          <>
            <TextField label="Name" value={name} onChangeText={setName} autoFocus maxLength={200} onSubmitEditing={rename} selectTextOnFocus />
            <Button label="Save" fullWidth onPress={rename} />
          </>
        ) : (
          <RowGroup>
            <ListRow
              icon={Star}
              title={doc.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
              chevron={false}
              onPress={() =>
                documentRepository
                  .setFavorite(doc.id, !doc.is_favorite)
                  .then(() => requestSync('doc-fav'))
                  .then(close)
                  .catch(toast.error)
              }
            />
            <ListRow
              icon={Pencil}
              title="Rename"
              chevron={false}
              onPress={() => {
                setName(doc.name);
                setMode('rename');
              }}
            />
            <ListRow icon={FolderInput} title="Move to folder" chevron={false} onPress={() => setMode('move')} />
            <ListRow icon={Copy} title="Make a copy" subtitle={online ? undefined : 'Copy will be created when you are online'} chevron={false} onPress={() => setMode('copy')} />
            <ListRow
              icon={doc.offline_status === 'available' ? CloudOff : CloudDownload}
              title={doc.offline_status === 'available' ? 'Remove offline copy' : 'Make available offline'}
              chevron={false}
              onPress={() => {
                close();
                void toggleOffline(doc, online);
              }}
            />
            <ListRow
              icon={Share2}
              title="Share…"
              chevron={false}
              onPress={() => {
                close();
                void shareDoc(doc, online);
              }}
            />
            <ListRow
              icon={Trash2}
              title="Delete"
              destructive
              chevron={false}
              onPress={() => {
                close();
                confirmDeleteDocuments([doc], () => {
                  if (router.canGoBack()) router.back();
                });
              }}
            />
          </RowGroup>
        )}
      </Sheet>
      <FolderPicker
        visible={mode === 'move' || mode === 'copy'}
        title={mode === 'copy' ? 'Copy to…' : 'Move to…'}
        currentId={doc.folder_id}
        onClose={close}
        onPick={(folderId) => {
          const op = mode === 'copy' ? copyDocument(doc, folderId) : documentRepository.move(doc.id, folderId);
          op.then(() => {
            requestSync('doc-move', 300);
            toast.success(mode === 'copy' ? 'Copy created' : 'Moved');
            close();
          }).catch(toast.error);
        }}
      />
    </>
  );
}
