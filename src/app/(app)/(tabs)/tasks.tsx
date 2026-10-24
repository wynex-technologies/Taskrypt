import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpDown, Plus, Search, Settings2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Chip, ChipRow, EmptyState, ErrorState, Fab, IconButton, Segmented, Sheet, SkeletonList, TextField, CONTENT_MAX_WIDTH } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { TaskItem } from '@/features/tasks/components/TaskItem';
import { useLists, useTags, useTasks } from '@/hooks/queries';
import type { TaskSort, TaskView } from '@/repositories/taskRepository';
import { useIsOnline } from '@/stores/networkStore';
import { useTheme } from '@/theme';
import { PRIORITY_LABELS, type Priority } from '@/types/domain';

const VIEWS: { value: TaskView; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Done' },
];

const SORTS: { value: TaskSort; label: string }[] = [
  { value: 'smart', label: 'Smart (due, then priority)' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'created', label: 'Newest first' },
  { value: 'title', label: 'Title A–Z' },
];

const EMPTY_COPY: Record<TaskView, { title: string; body: string }> = {
  today: { title: 'All clear for today', body: 'Nothing due. Add something small to build momentum.' },
  upcoming: { title: 'No upcoming tasks', body: 'Plan ahead by giving tasks a due date.' },
  all: { title: 'No tasks yet', body: 'Create your first task — your companion will cheer you on.' },
  completed: { title: 'Nothing completed yet', body: 'Finished tasks appear here as your history.' },
  overdue: { title: 'Nothing overdue', body: 'You are on top of things.' },
  nodate: { title: 'No unscheduled tasks', body: 'Tasks without a date appear here.' },
};

export default function Tasks() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const params = useLocalSearchParams<{ view?: TaskView; listId?: string }>();
  const [view, setView] = useState<TaskView>(params.view ?? 'today');
  const [search, setSearch] = useState('');
  const [listId, setListId] = useState<string | null>(params.listId ?? null);
  const [tagId, setTagId] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [sort, setSort] = useState<TaskSort>('smart');
  const [sortOpen, setSortOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Follow deep links like /tasks?view=overdue (state adjusted during render, not in an effect).
  const [lastParamView, setLastParamView] = useState(params.view);
  if (params.view !== lastParamView) {
    setLastParamView(params.view);
    if (params.view) setView(params.view);
  }

  const lists = useLists();
  const tags = useTags();
  const filter = useMemo(() => ({ view, search, listId, tagId, priorities, sort }), [view, search, listId, tagId, priorities, sort]);
  const tasks = useTasks(filter);
  const listMap = useMemo(() => new Map((lists.data ?? []).map((l) => [l.id, l])), [lists.data]);
  const filtered = !!(search || listId || tagId || priorities.length);

  const togglePriority = (p: Priority) => setPriorities((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const header = (
    <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <View style={styles.titleRow}>
        <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          Tasks
        </AppText>
        <IconButton icon={searchOpen ? X : Search} label={searchOpen ? 'Close search' : 'Search tasks'} onPress={() => { setSearchOpen((o) => !o); if (searchOpen) setSearch(''); }} />
        <IconButton icon={ArrowUpDown} label="Sort tasks" onPress={() => setSortOpen(true)} />
        <IconButton icon={Settings2} label="Manage lists, categories and tags" onPress={() => router.push('/settings/lists')} />
      </View>
      {searchOpen ? <TextField icon={Search} placeholder="Search titles and notes" value={search} onChangeText={setSearch} autoFocus returnKeyType="search" accessibilityLabel="Search tasks" /> : null}
      <Segmented options={VIEWS} value={view} onChange={setView} accessibilityLabel="Task view" />
      <ChipRow>
        {(lists.data ?? []).map((l) => (
          <Chip key={l.id} label={l.name} color={l.color} selected={listId === l.id} onPress={() => setListId(listId === l.id ? null : l.id)} />
        ))}
        {([3, 2, 1, 0] as Priority[]).map((p) => (
          <Chip key={p} label={PRIORITY_LABELS[p]} color={theme.colors.priority[(['low', 'medium', 'high', 'urgent'] as const)[p]].fg} selected={priorities.includes(p)} onPress={() => togglePriority(p)} />
        ))}
        {(tags.data ?? []).map((t) => (
          <Chip key={t.id} label={`#${t.name}`} selected={tagId === t.id} onPress={() => setTagId(tagId === t.id ? null : t.id)} />
        ))}
      </ChipRow>
      {filtered ? (
        <Chip
          label="Clear filters"
          icon={X}
          onPress={() => {
            setSearch('');
            setListId(null);
            setTagId(null);
            setPriorities([]);
          }}
        />
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <FlatList
        data={tasks.data ?? []}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: theme.spacing.xl, paddingBottom: 120, gap: 10, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <TaskItem task={item} listColor={item.list_id ? listMap.get(item.list_id)?.color : undefined} listName={item.list_id ? listMap.get(item.list_id)?.name : undefined} />}
        ListEmptyComponent={
          tasks.isLoading ? (
            <SkeletonList />
          ) : tasks.error ? (
            <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
          ) : filtered ? (
            <EmptyState title="No matches" body="Try a different search or clear the filters." mood="idle" />
          ) : (
            <EmptyState {...EMPTY_COPY[view]} mood={online ? 'empty' : 'offline'} actionLabel={view === 'completed' ? undefined : 'New task'} onAction={() => router.push('/tasks/new')} />
          )
        }
        ListFooterComponent={
          (tasks.data?.length ?? 0) > 0 && view === 'completed' ? (
            <View style={{ alignItems: 'center', paddingTop: 16 }}>
              <Mascot size={64} mood="taskCompleted" />
              <AppText variant="caption" color="textMuted">
                {tasks.data?.length} completed
              </AppText>
            </View>
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={9}
      />
      <Fab icon={Plus} label="New task" onPress={() => router.push({ pathname: '/tasks/new', params: listId ? { listId } : {} })} bottomOffset={8} />
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        {SORTS.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            selected={sort === s.value}
            onPress={() => {
              setSort(s.value);
              setSortOpen(false);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
});
