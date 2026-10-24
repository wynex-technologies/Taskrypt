import { router, useLocalSearchParams } from 'expo-router';
import { Bell, CalendarDays, CircleCheck, Flag, Hash, ListTodo, Pencil, Repeat, RotateCcw, Shapes, Trash2 } from 'lucide-react-native';
import { Alert, View } from 'react-native';

import { AppText, Button, Card, EmptyState, IconButton, ListRow, Pill, RowGroup, Screen, SkeletonList, toast } from '@/components';
import { Mascot } from '@/features/animation/Mascot';
import { describeRecurrence } from '@/features/tasks/recurrence';
import { deleteTask, toggleTask } from '@/features/tasks/taskService';
import { useCategories, useLists, useTask } from '@/hooks/queries';
import { formatDateTime, formatDue, relativeTime } from '@/lib/time';
import { useTheme } from '@/theme';
import { PRIORITY_KEYS, PRIORITY_LABELS } from '@/types/domain';

function reminderLabel(min: number | null) {
  if (min == null) return 'No reminder';
  if (min === 0) return 'At the due time';
  if (min < 60) return `${min} minutes before`;
  if (min < 1440) return `${Math.round(min / 60)} hour(s) before`;
  return `${Math.round(min / 1440)} day(s) before`;
}

export default function TaskDetails() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useTask(id);
  const lists = useLists();
  const categories = useCategories();

  if (task.isLoading)
    return (
      <Screen back>
        <SkeletonList rows={4} />
      </Screen>
    );
  const t = task.data;
  if (!t)
    return (
      <Screen back>
        <EmptyState title="Task not found" body="It may have been deleted on another device." mood="error" actionLabel="Back to tasks" onAction={() => router.replace('/tasks')} />
      </Screen>
    );

  const done = t.status === 'done';
  const pr = theme.colors.priority[PRIORITY_KEYS[t.priority]];
  const list = lists.data?.find((l) => l.id === t.list_id);
  const category = categories.data?.find((c) => c.id === t.category_id);

  const confirmDelete = () =>
    Alert.alert('Delete task?', `“${t.title}” will be removed from all your devices.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteTask(t.id)
            .then(() => {
              toast.success('Task deleted');
              router.back();
            })
            .catch(toast.error),
      },
    ]);

  return (
    <Screen
      back
      right={
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon={Pencil} label="Edit task" onPress={() => router.push({ pathname: '/tasks/[id]/edit', params: { id: t.id } })} />
          <IconButton icon={Trash2} label="Delete task" tone="danger" onPress={confirmDelete} />
        </View>
      }
      footer={
        <Button
          label={done ? 'Mark as not done' : 'Mark as done'}
          icon={done ? RotateCcw : CircleCheck}
          variant={done ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          onPress={() => toggleTask(t.id, !done).catch(toast.error)}
        />
      }
    >
      <View style={{ gap: theme.spacing.xl }}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pill label={`${PRIORITY_LABELS[t.priority]} priority`} fg={pr.fg} bg={pr.bg} icon={Flag} />
            {done ? <Pill label="Completed" fg={theme.colors.success} bg={theme.colors.successSoft} icon={CircleCheck} /> : null}
          </View>
          <AppText variant="title" accessibilityRole="header" style={done ? { textDecorationLine: 'line-through', color: theme.colors.textMuted } : null}>
            {t.title}
          </AppText>
          {t.description ? (
            <Card tone="sunken">
              <AppText selectable>{t.description}</AppText>
            </Card>
          ) : null}
        </View>

        <RowGroup title="Details">
          <ListRow icon={CalendarDays} title={t.due_at ? formatDue(t.due_at, t.all_day) : 'No due date'} subtitle={t.due_at ? formatDateTime(t.due_at) : undefined} />
          <ListRow icon={Bell} title={reminderLabel(t.due_at ? t.reminder_offset_minutes : null)} />
          <ListRow icon={Repeat} title={describeRecurrence(t.recurrence)} />
          <ListRow icon={ListTodo} title={list?.name ?? 'Inbox'} iconColor={list?.color} />
          {category ? <ListRow icon={Shapes} title={category.name} iconColor={category.color} /> : null}
          {t.tags.length ? <ListRow icon={Hash} title={t.tags.map((g) => `#${g.name}`).join('  ')} /> : null}
        </RowGroup>

        {done ? (
          <Card tone="primary" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Mascot size={64} mood="taskCompleted" />
            <AppText style={{ flex: 1 }}>Completed {relativeTime(t.completed_at)}. Nicely done.</AppText>
          </Card>
        ) : null}

        <AppText variant="caption" color="textSubtle">
          Created {formatDateTime(t.created_at)} · Last change {relativeTime(t.client_updated_at)} · {t.sync_state === 'synced' ? 'Synced' : t.sync_state === 'failed' ? 'Sync failed' : 'Waiting to sync'}
        </AppText>
      </View>
    </Screen>
  );
}
