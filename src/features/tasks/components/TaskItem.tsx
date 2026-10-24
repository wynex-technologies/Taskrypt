import { router } from 'expo-router';
import { Bell, CircleAlert, CloudUpload, Repeat, Trash2 } from 'lucide-react-native';
import { memo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { AppText, Checkbox, Pill, ScalePressable } from '@/components';
import { toast } from '@/components/Toast';
import { userMessageOf } from '@/lib/errors';
import { formatDue } from '@/lib/time';
import type { TaskWithTags } from '@/repositories/taskRepository';
import { useTheme } from '@/theme';
import { PRIORITY_KEYS, PRIORITY_LABELS } from '@/types/domain';

import { deleteTask, toggleTask } from '../taskService';

type Props = { task: TaskWithTags; listColor?: string; listName?: string };

export const TaskItem = memo(function TaskItem({ task, listColor, listName }: Props) {
  const theme = useTheme();
  const swipe = useRef<SwipeableMethods>(null);
  const done = task.status === 'done';
  const pkey = PRIORITY_KEYS[task.priority];
  const pr = theme.colors.priority[pkey];
  const overdue = !done && task.due_at && new Date(task.due_at) < new Date(new Date().setHours(0, 0, 0, 0));

  const onToggle = (next: boolean) => {
    toggleTask(task.id, next)
      .then(({ next: nextOccurrence }) => {
        if (next && nextOccurrence) toast.info('Next occurrence scheduled');
      })
      .catch((e) => toast.error(userMessageOf(e)));
  };

  const onDelete = () => {
    swipe.current?.close();
    deleteTask(task.id)
      .then(() => toast.success('Task deleted'))
      .catch((e) => toast.error(e));
  };

  const meta = [
    task.due_at ? formatDue(task.due_at, task.all_day) : null,
    listName ?? null,
  ].filter(Boolean);

  const a11y = [task.title, done ? 'completed' : null, `${PRIORITY_LABELS[task.priority]} priority`, task.due_at ? `due ${formatDue(task.due_at, task.all_day)}` : null, overdue ? 'overdue' : null]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View
      layout={theme.reduceMotion ? undefined : LinearTransition.springify().damping(20)}
      entering={theme.reduceMotion ? undefined : FadeIn.duration(220)}
      exiting={theme.reduceMotion ? undefined : FadeOut.duration(160)}
    >
      <Swipeable
        ref={swipe}
        friction={2}
        rightThreshold={60}
        overshootRight={false}
        renderRightActions={() => (
          <ScalePressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${task.title}`}
            style={[styles.delete, { backgroundColor: theme.colors.danger, borderRadius: theme.radii.lg }]}
          >
            <Trash2 color="#FFFFFF" size={20} />
            <AppText variant="caption" style={{ color: '#FFFFFF' }}>
              Delete
            </AppText>
          </ScalePressable>
        )}
      >
        <View style={[styles.row, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderColor: theme.colors.border }]}>
          <View style={[styles.stripe, { backgroundColor: listColor ?? pr.fg, opacity: done ? 0.3 : 1 }]} />
          <Checkbox checked={done} onChange={onToggle} label={`Mark ${task.title} as ${done ? 'not done' : 'done'}`} color={pr.fg} testID={`task-check-${task.id}`} />
          <ScalePressable
            style={{ flex: 1, gap: 4 }}
            pressedScale={0.99}
            onPress={() => router.push({ pathname: '/tasks/[id]', params: { id: task.id } })}
            accessibilityRole="button"
            accessibilityLabel={a11y}
            accessibilityHint="Opens task details"
          >
            <AppText variant="bodyStrong" numberOfLines={2} style={done ? { textDecorationLine: 'line-through', color: theme.colors.textSubtle } : null}>
              {task.title}
            </AppText>
            <View style={styles.meta}>
              {task.priority >= 2 && !done ? <Pill label={PRIORITY_LABELS[task.priority]} fg={pr.fg} bg={pr.bg} /> : null}
              {meta.length ? (
                <AppText variant="caption" style={{ color: overdue ? theme.colors.danger : theme.colors.textMuted }} numberOfLines={1}>
                  {overdue ? 'Overdue · ' : ''}
                  {meta.join(' · ')}
                </AppText>
              ) : null}
              {task.recurrence ? <Repeat size={13} color={theme.colors.textMuted} accessibilityLabel="Repeats" /> : null}
              {task.reminder_offset_minutes != null && task.due_at && !done ? <Bell size={13} color={theme.colors.textMuted} accessibilityLabel="Reminder set" /> : null}
              {task.sync_state === 'pending' ? <CloudUpload size={13} color={theme.colors.textSubtle} accessibilityLabel="Waiting to sync" /> : null}
              {task.sync_state === 'failed' ? <CircleAlert size={13} color={theme.colors.danger} accessibilityLabel="Sync failed" /> : null}
            </View>
            {task.tags.length ? (
              <View style={styles.meta}>
                {task.tags.slice(0, 3).map((t) => (
                  <AppText key={t.id} variant="caption" style={{ color: t.color }}>
                    #{t.name}
                  </AppText>
                ))}
                {task.tags.length > 3 ? (
                  <AppText variant="caption" color="textSubtle">
                    +{task.tags.length - 3}
                  </AppText>
                ) : null}
              </View>
            ) : null}
          </ScalePressable>
        </View>
      </Swipeable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingLeft: 18, paddingRight: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  delete: { width: 88, marginLeft: 8, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
