import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bell, BellOff, Settings } from 'lucide-react-native';
import { Linking, View } from 'react-native';

import { AppText, Button, Card, Chip, ChipRow, EmptyState, ListRow, RowGroup, Screen, SwitchRow, toast } from '@/components';
import { formatDateTime } from '@/lib/time';
import { getPermissionStatus, listScheduled, requestPermission, rescheduleAll } from '@/services/notifications/reminders';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTheme } from '@/theme';

const DEFAULTS = [0, 5, 15, 30, 60];

export default function Reminders() {
  const theme = useTheme();
  const enabled = usePreferencesStore((s) => s.remindersEnabled);
  const def = usePreferencesStore((s) => s.defaultReminderMinutes);
  const set = usePreferencesStore((s) => s.set);
  const permission = useQuery({ queryKey: ['notif-permission'], queryFn: getPermissionStatus });
  const scheduled = useQuery({ queryKey: ['tasks', 'scheduled-notifications'], queryFn: listScheduled });

  const upcoming = (scheduled.data ?? [])
    .map((n) => {
      const trig = n.trigger as { value?: number; date?: number | string } | null;
      const at = trig?.value ?? trig?.date;
      return { id: n.identifier, title: n.content.title ?? 'Reminder', taskId: (n.content.data as { taskId?: string } | undefined)?.taskId, at: at ? new Date(at) : null };
    })
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));

  const toggle = async (v: boolean) => {
    if (v && !(await requestPermission())) {
      toast.error('Notifications are blocked. Enable them for Taskrypt in system settings.');
      void permission.refetch();
      return;
    }
    set('remindersEnabled', v);
    await rescheduleAll();
    void scheduled.refetch();
  };

  return (
    <Screen title="Reminders" subtitle="Local notifications — they work offline." back>
      <View style={{ gap: theme.spacing.xl }}>
        {permission.data === 'unavailable' ? (
          <Card tone="sunken" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <BellOff size={18} color={theme.colors.warning} />
            <AppText variant="label" style={{ flex: 1 }}>
              Reminders are not available in Expo Go on Android. Use a development build (npx expo run:android or EAS) to get notifications.
            </AppText>
          </Card>
        ) : null}
        {permission.data === 'denied' ? (
          <Card tone="sunken" style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <BellOff size={18} color={theme.colors.warning} />
              <AppText variant="label" style={{ flex: 1 }}>
                Notifications are turned off for Taskrypt.
              </AppText>
            </View>
            <Button label="Open system settings" icon={Settings} variant="secondary" size="sm" onPress={() => void Linking.openSettings()} />
          </Card>
        ) : null}
        <RowGroup>
          <SwitchRow icon={Bell} title="Task reminders" subtitle="Notify me before tasks are due" value={enabled} onValueChange={(v) => void toggle(v)} />
        </RowGroup>
        <View style={{ gap: 8 }}>
          <AppText variant="label" color="textMuted">
            Default for new tasks
          </AppText>
          <ChipRow>
            {DEFAULTS.map((m) => (
              <Chip key={m} label={m === 0 ? 'At due time' : `${m} min before`} selected={def === m} onPress={() => set('defaultReminderMinutes', m)} />
            ))}
          </ChipRow>
        </View>
        <View style={{ gap: 10 }}>
          <AppText variant="heading">Scheduled</AppText>
          {upcoming.length === 0 ? (
            <EmptyState compact title="No reminders scheduled" body="Add a due date and reminder to a task." mood="idle" />
          ) : (
            <RowGroup>
              {upcoming.map((u) => (
                <ListRow key={u.id} icon={Bell} title={u.title} subtitle={u.at ? formatDateTime(u.at.toISOString()) : undefined} onPress={u.taskId ? () => router.push({ pathname: '/tasks/[id]', params: { id: u.taskId! } }) : undefined} />
              ))}
            </RowGroup>
          )}
        </View>
      </View>
    </Screen>
  );
}
