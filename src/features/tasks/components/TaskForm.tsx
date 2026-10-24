import { zodResolver } from '@hookform/resolvers/zod';
import { Bell, Flag, Hash, ListTodo, Plus, Repeat, Shapes, Type } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { AppText, Button, Chip, ChipRow, Segmented, SwitchRow, TextField, toast } from '@/components';
import { DateTimeField } from '@/components/DateTimeField';
import { FormField } from '@/components/FormField';
import { useCategories, useLists, useTags } from '@/hooks/queries';
import { tagRepository, type TaskInput, type TaskWithTags } from '@/repositories/taskRepository';
import { requestPermission } from '@/services/notifications/reminders';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';
import { PRIORITY_KEYS, PRIORITY_LABELS, type Priority, type RecurrenceRule } from '@/types/domain';

import { describeRecurrence } from '../recurrence';

const recurrenceSchema = z
  .object({
    freq: z.enum(['daily', 'weekly', 'monthly', 'custom']),
    interval: z.number().int().min(1).max(365),
    weekdays: z.array(z.number().int().min(0).max(6)).optional(),
    unit: z.enum(['day', 'week', 'month']).optional(),
  })
  .nullable();

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the task a title').max(200, 'Keep titles under 200 characters'),
    description: z.string().max(5000, 'Notes can be up to 5000 characters'),
    hasDue: z.boolean(),
    due: z.date(),
    allDay: z.boolean(),
    priority: z.number().int().min(0).max(3),
    listId: z.string().nullable(),
    categoryId: z.string().nullable(),
    tagIds: z.array(z.string()),
    recurrence: recurrenceSchema,
    reminder: z.number().int().min(0).max(10080).nullable(),
  })
  .refine((v) => !v.recurrence || v.hasDue, { path: ['recurrence'], message: 'Repeating tasks need a due date' })
  .refine((v) => v.reminder === null || v.hasDue, { path: ['reminder'], message: 'Reminders need a due date' });

export type TaskFormValues = z.infer<typeof taskFormSchema>;

const REMINDERS: { value: number | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 0, label: 'At time' },
  { value: 5, label: '5 min before' },
  { value: 15, label: '15 min' },
  { value: 60, label: '1 hour' },
  { value: 1440, label: '1 day' },
];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function defaultDue() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

export function toFormValues(task?: TaskWithTags | null, preset?: { listId?: string; due?: Date }): TaskFormValues {
  const defaultReminder = usePreferencesStore.getState().defaultReminderMinutes;
  if (!task)
    return {
      title: '',
      description: '',
      hasDue: !!preset?.due,
      due: preset?.due ?? defaultDue(),
      allDay: false,
      priority: 1,
      listId: preset?.listId ?? null,
      categoryId: null,
      tagIds: [],
      recurrence: null,
      reminder: preset?.due ? defaultReminder : null,
    };
  return {
    title: task.title,
    description: task.description ?? '',
    hasDue: !!task.due_at,
    due: task.due_at ? new Date(task.due_at) : defaultDue(),
    allDay: task.all_day,
    priority: task.priority,
    listId: task.list_id,
    categoryId: task.category_id,
    tagIds: task.tags.map((t) => t.id),
    recurrence: task.recurrence ? { freq: task.recurrence.freq, interval: task.recurrence.interval, weekdays: task.recurrence.weekdays, unit: task.recurrence.unit } : null,
    reminder: task.reminder_offset_minutes,
  };
}

export function toTaskInput(v: TaskFormValues): TaskInput {
  const due = new Date(v.due);
  if (v.allDay) due.setHours(12, 0, 0, 0); // noon avoids DST/timezone day flips
  return {
    title: v.title,
    description: v.description || null,
    due_at: v.hasDue ? due.toISOString() : null,
    all_day: v.hasDue && v.allDay,
    priority: v.priority as Priority,
    list_id: v.listId,
    category_id: v.categoryId,
    tag_ids: v.tagIds,
    recurrence: v.hasDue ? (v.recurrence as RecurrenceRule | null) : null,
    reminder_offset_minutes: v.hasDue ? v.reminder : null,
  };
}

function Section({ icon: Icon, title, children }: { icon: typeof Flag; title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon size={16} color={theme.colors.textMuted} />
        <AppText variant="label" color="textMuted">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

export function TaskForm({ initial, submitLabel, onSubmit }: { initial: TaskFormValues; submitLabel: string; onSubmit: (v: TaskFormValues) => Promise<void> }) {
  const theme = useTheme();
  const lists = useLists();
  const categories = useCategories();
  const tags = useTags();
  const [newTag, setNewTag] = useState('');
  const { control, handleSubmit, setValue, formState } = useForm<TaskFormValues>({ resolver: zodResolver(taskFormSchema), defaultValues: initial });
  const hasDue = useWatch({ control, name: 'hasDue' });
  const allDay = useWatch({ control, name: 'allDay' });
  const recurrence = useWatch({ control, name: 'recurrence' });
  const tagIds = useWatch({ control, name: 'tagIds' });

  const submit = handleSubmit(async (v) => {
    if (v.hasDue && v.reminder !== null) {
      const ok = await requestPermission().catch(() => false);
      if (!ok) toast.info('Notifications are off — enable them in Settings to get reminders.');
    }
    await onSubmit(v);
  });

  const addTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    try {
      const tag = await tagRepository.create(name.slice(0, 32));
      setValue('tagIds', [...new Set([...(tagIds ?? []), tag.id])]);
      setNewTag('');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <FormField control={control} name="title" label="Title" icon={Type} placeholder="What needs doing?" autoFocus={!initial.title} returnKeyType="next" maxLength={200} testID="task-title" />
      <FormField control={control} name="description" label="Notes" placeholder="Add details (optional)" multiline maxLength={5000} />

      <Section icon={Flag} title="Priority">
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <Segmented
              accessibilityLabel="Priority"
              value={field.value}
              onChange={field.onChange}
              options={PRIORITY_LABELS.map((label, i) => ({ value: i, label }))}
            />
          )}
        />
      </Section>

      <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
        <Controller control={control} name="hasDue" render={({ field }) => <SwitchRow title="Due date" subtitle={field.value ? undefined : 'No date — appears under All'} value={field.value} onValueChange={field.onChange} />} />
        {hasDue ? (
          <View style={{ padding: 16, paddingTop: 0, gap: 12 }}>
            <Controller control={control} name="due" render={({ field }) => <DateTimeField value={field.value} onChange={field.onChange} showTime={!allDay} />} />
            <Controller control={control} name="allDay" render={({ field }) => <Chip label="All day" selected={field.value} onPress={() => field.onChange(!field.value)} />} />
          </View>
        ) : null}
      </View>

      {hasDue ? (
        <Section icon={Bell} title="Reminder">
          <Controller
            control={control}
            name="reminder"
            render={({ field, fieldState }) => (
              <>
                <ChipRow>
                  {REMINDERS.map((r) => (
                    <Chip key={String(r.value)} label={r.label} selected={field.value === r.value} onPress={() => field.onChange(r.value)} />
                  ))}
                </ChipRow>
                {fieldState.error ? <AppText variant="caption" color="danger">{fieldState.error.message}</AppText> : null}
              </>
            )}
          />
        </Section>
      ) : null}

      {hasDue ? (
        <Section icon={Repeat} title={`Repeat — ${describeRecurrence(recurrence as RecurrenceRule | null)}`}>
          <Controller
            control={control}
            name="recurrence"
            render={({ field }) => {
              const r = field.value;
              return (
                <View style={{ gap: 10 }}>
                  <ChipRow>
                    <Chip label="Never" selected={!r} onPress={() => field.onChange(null)} />
                    <Chip label="Daily" selected={r?.freq === 'daily'} onPress={() => field.onChange({ freq: 'daily', interval: 1 })} />
                    <Chip label="Weekly" selected={r?.freq === 'weekly'} onPress={() => field.onChange({ freq: 'weekly', interval: 1, weekdays: [new Date().getDay()] })} />
                    <Chip label="Monthly" selected={r?.freq === 'monthly'} onPress={() => field.onChange({ freq: 'monthly', interval: 1 })} />
                    <Chip label="Custom" selected={r?.freq === 'custom'} onPress={() => field.onChange({ freq: 'custom', interval: 2, unit: 'day' })} />
                  </ChipRow>
                  {r?.freq === 'weekly' ? (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {WEEKDAYS.map((d, i) => {
                        const on = r.weekdays?.includes(i) ?? false;
                        return (
                          <Chip
                            key={i}
                            label={d}
                            selected={on}
                            testID={`weekday-${i}`}
                            accessibilityLabel={`${WEEKDAY_NAMES[i]}${on ? ", selected" : ""}`}
                            onPress={() => {
                              const next = on ? (r.weekdays ?? []).filter((x) => x !== i) : [...(r.weekdays ?? []), i];
                              field.onChange({ ...r, weekdays: next.length ? next : [i] });
                            }}
                          />
                        );
                      })}
                    </View>
                  ) : null}
                  {r?.freq === 'custom' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <AppText>Every</AppText>
                      <View style={{ width: 80 }}>
                        <TextField
                          keyboardType="number-pad"
                          value={String(r.interval)}
                          maxLength={3}
                          accessibilityLabel="Repeat interval"
                          onChangeText={(t) => field.onChange({ ...r, interval: Math.max(1, Math.min(365, parseInt(t || '1', 10) || 1)) })}
                        />
                      </View>
                      <Segmented
                        value={r.unit ?? 'day'}
                        onChange={(u) => field.onChange({ ...r, unit: u })}
                        options={[
                          { value: 'day', label: 'Days' },
                          { value: 'week', label: 'Weeks' },
                          { value: 'month', label: 'Months' },
                        ]}
                      />
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        </Section>
      ) : null}

      <Section icon={ListTodo} title="List">
        <Controller
          control={control}
          name="listId"
          render={({ field }) => (
            <ChipRow>
              <Chip label="Inbox" selected={!field.value} onPress={() => field.onChange(null)} />
              {(lists.data ?? []).map((l) => (
                <Chip key={l.id} label={l.name} color={l.color} selected={field.value === l.id} onPress={() => field.onChange(l.id)} />
              ))}
            </ChipRow>
          )}
        />
      </Section>

      {(categories.data?.length ?? 0) > 0 ? (
        <Section icon={Shapes} title="Category">
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <ChipRow>
                <Chip label="None" selected={!field.value} onPress={() => field.onChange(null)} />
                {(categories.data ?? []).map((c) => (
                  <Chip key={c.id} label={c.name} color={c.color} selected={field.value === c.id} onPress={() => field.onChange(c.id)} />
                ))}
              </ChipRow>
            )}
          />
        </Section>
      ) : null}

      <Section icon={Hash} title="Tags">
        <Controller
          control={control}
          name="tagIds"
          render={({ field }) => (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(tags.data ?? []).map((t) => {
                const on = field.value.includes(t.id);
                return <Chip key={t.id} label={`#${t.name}`} color={t.color} selected={on} onPress={() => field.onChange(on ? field.value.filter((x) => x !== t.id) : [...field.value, t.id])} />;
              })}
            </View>
          )}
        />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <TextField placeholder="New tag" value={newTag} onChangeText={setNewTag} maxLength={32} autoCapitalize="none" onSubmitEditing={addTag} returnKeyType="done" accessibilityLabel="New tag name" />
          </View>
          <Button label="Add" icon={Plus} variant="secondary" size="sm" onPress={addTag} disabled={!newTag.trim()} />
        </View>
      </Section>

      <Button label={submitLabel} size="lg" fullWidth loading={formState.isSubmitting} onPress={submit} testID="task-submit" />
    </View>
  );
}

export { PRIORITY_KEYS };
