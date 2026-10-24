import { Folder, FolderOpen } from 'lucide-react-native';
import { useMemo } from 'react';

import { ListRow, RowGroup, Sheet } from '@/components';
import { useAllFolders } from '@/hooks/queries';
import type { LocalFolder } from '@/types/domain';

type Props = { visible: boolean; title: string; onClose: () => void; onPick: (folderId: string | null) => void; excludeId?: string; currentId?: string | null };

/** Choose a destination folder (indented tree). `excludeId` hides a folder and its subtree. */
export function FolderPicker({ visible, title, onClose, onPick, excludeId, currentId }: Props) {
  const folders = useAllFolders();
  const rows = useMemo(() => {
    const all = folders.data ?? [];
    const children = new Map<string | null, LocalFolder[]>();
    for (const f of all) {
      const list = children.get(f.parent_id) ?? [];
      list.push(f);
      children.set(f.parent_id, list);
    }
    const out: { f: LocalFolder; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const f of children.get(parent) ?? []) {
        if (f.id === excludeId) continue;
        out.push({ f, depth });
        if (depth < 8) walk(f.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [folders.data, excludeId]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <RowGroup>
        <ListRow icon={FolderOpen} title="Vault (top level)" subtitle={currentId === null ? 'Current location' : undefined} onPress={() => onPick(null)} chevron={false} />
        {rows.map(({ f, depth }) => (
          <ListRow
            key={f.id}
            icon={Folder}
            iconColor={f.color}
            title={`${'   '.repeat(depth)}${f.name}`}
            subtitle={currentId === f.id ? 'Current location' : undefined}
            onPress={() => onPick(f.id)}
            chevron={false}
          />
        ))}
      </RowGroup>
    </Sheet>
  );
}
