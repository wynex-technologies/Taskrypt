import { Hash, ListTodo, Plus, Shapes, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AppText, Button, Chip, ChipRow, IconButton, ListRow, RowGroup, Screen, Segmented, TextField, toast } from '@/components';
import { requestSync } from '@/features/sync/syncService';
import { useCategories, useLists, useTags } from '@/hooks/queries';
import { categoryRepository, listRepository, TAG_COLORS, tagRepository } from '@/repositories/taskRepository';
import { useTheme } from '@/theme';

type Kind = 'lists' | 'categories' | 'tags';

export default function ManageLists() {
  const theme = useTheme();
  const [kind, setKind] = useState<Kind>('lists');
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]!);
  const lists = useLists();
  const categories = useCategories();
  const tags = useTags();

  const items = kind === 'lists' ? lists.data ?? [] : kind === 'categories' ? categories.data ?? [] : tags.data ?? [];
  const Icon = kind === 'lists' ? ListTodo : kind === 'categories' ? Shapes : Hash;
  const max = kind === 'tags' ? 32 : kind === 'categories' ? 40 : 60;

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      if (kind === 'lists') await listRepository.create(n, color);
      else if (kind === 'categories') await categoryRepository.create(n, color);
      else await tagRepository.create(n, color);
      setName('');
      requestSync('lists');
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = (id: string, label: string) =>
    Alert.alert(`Delete “${label}”?`, kind === 'tags' ? 'The tag is removed from all tasks.' : 'Tasks are kept and simply lose this ' + (kind === 'lists' ? 'list.' : 'category.'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const op = kind === 'lists' ? listRepository.remove(id) : kind === 'categories' ? categoryRepository.remove(id) : tagRepository.remove(id);
          op.then(() => requestSync('lists')).catch(toast.error);
        },
      },
    ]);

  return (
    <Screen title="Organise" subtitle="Lists group tasks, categories describe them, tags cross-cut." back keyboard>
      <View style={{ gap: theme.spacing.xl }}>
        <Segmented<Kind>
          accessibilityLabel="What to manage"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'lists', label: 'Lists' },
            { value: 'categories', label: 'Categories' },
            { value: 'tags', label: 'Tags' },
          ]}
        />
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <TextField placeholder={`New ${kind === 'lists' ? 'list' : kind === 'categories' ? 'category' : 'tag'}`} value={name} onChangeText={setName} maxLength={max} onSubmitEditing={add} returnKeyType="done" accessibilityLabel="Name" />
            </View>
            <Button label="Add" icon={Plus} onPress={add} disabled={!name.trim()} />
          </View>
          <ChipRow>
            {TAG_COLORS.map((c) => (
              <Chip key={c} label=" " color={c} selected={c === color} onPress={() => setColor(c)} accessibilityLabel={`Colour ${c}`} />
            ))}
          </ChipRow>
        </View>
        {items.length === 0 ? (
          <AppText color="textMuted" align="center">
            Nothing here yet.
          </AppText>
        ) : (
          <RowGroup>
            {items.map((i) => (
              <ListRow key={i.id} icon={Icon} iconColor={i.color} title={kind === 'tags' ? `#${i.name}` : i.name} right={<IconButton icon={Trash2} label={`Delete ${i.name}`} tone="danger" size={18} onPress={() => remove(i.id, i.name)} />} />
            ))}
          </RowGroup>
        )}
      </View>
    </Screen>
  );
}
