import type { NotificationRequest } from 'expo-notifications';
import { Platform } from 'react-native';

import { createLogger } from '@/lib/logger';
import { taskRepository } from '@/repositories/taskRepository';
import { usePreferencesStore } from '@/stores/preferencesStore';
import type { LocalTask, Task } from '@/types/domain';

import { getNotifications } from './notificationsModule';

const log = createLogger('reminders');
const CHANNEL = 'task-reminders';

let configured = false;

export function configureNotifications() {
  const Notifications = getNotifications();
  if (configured || !Notifications) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Task reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#D9653B',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}

/** 'unavailable' when running in Expo Go on Android (no notification module). */
export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined' | 'unavailable'> {
  const Notifications = getNotifications();
  if (!Notifications) return 'unavailable';
  const s = await Notifications.getPermissionsAsync();
  return s.granted ? 'granted' : s.canAskAgain ? 'undetermined' : 'denied';
}

export async function requestPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return next.granted;
}

export function reminderTime(task: Pick<Task, 'due_at' | 'all_day' | 'reminder_offset_minutes'>): Date | null {
  if (!task.due_at || task.reminder_offset_minutes == null) return null;
  const due = new Date(task.due_at);
  // All-day tasks remind at 09:00 local on the day, minus the offset.
  if (task.all_day) due.setHours(9, 0, 0, 0);
  return new Date(due.getTime() - task.reminder_offset_minutes * 60_000);
}

async function cancelIds(ids: string[]) {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await Promise.allSettled(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

/** Idempotent: always cancels what was scheduled before for this task. */
export async function syncTaskReminder(task: LocalTask): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  try {
    if (task.notification_ids?.length) await cancelIds(task.notification_ids);
    const enabled = usePreferencesStore.getState().remindersEnabled;
    const at = reminderTime(task);
    if (!enabled || task.deleted_at || task.status === 'done' || !at || at.getTime() <= Date.now() + 5000) {
      if (task.notification_ids?.length) await taskRepository.setNotificationIds(task.id, []);
      return;
    }
    if ((await getPermissionStatus()) !== 'granted') return;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title,
        body: task.description?.slice(0, 120) || 'Reminder from Taskrypt',
        data: { taskId: task.id, url: `/tasks/${task.id}` },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
    });
    await taskRepository.setNotificationIds(task.id, [id]);
  } catch (e) {
    log.warn('could not schedule reminder', e);
  }
}

export async function cancelTaskReminder(task: Pick<LocalTask, 'id' | 'notification_ids'>) {
  if (task.notification_ids?.length) await cancelIds(task.notification_ids);
}

/** Rebuild every reminder from SQLite (after sign-in, sync pulls or a settings change). */
export async function rescheduleAll(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  const tasks = await taskRepository.withReminders();
  for (const t of tasks) await syncTaskReminder({ ...t, notification_ids: [] });
}

export async function cancelAllReminders(): Promise<void> {
  await getNotifications()?.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}

export async function listScheduled(): Promise<NotificationRequest[]> {
  return (await getNotifications()?.getAllScheduledNotificationsAsync()) ?? [];
}

/** Subscribe to taps on reminders. No-op where notifications are unavailable. */
export function onReminderTapped(handler: (url: string) => void): () => void {
  const Notifications = getNotifications();
  if (!Notifications) return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = r.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/tasks/')) handler(url);
  });
  return () => sub.remove();
}
