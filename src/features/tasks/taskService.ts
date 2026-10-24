import * as Haptics from 'expo-haptics';

import { mascot } from '@/features/animation/mascotStore';
import { requestSync } from '@/features/sync/syncService';
import { taskRepository, type TaskInput } from '@/repositories/taskRepository';
import { cancelTaskReminder, syncTaskReminder } from '@/services/notifications/reminders';
import { usePreferencesStore } from '@/stores/preferencesStore';

/**
 * Use-cases that combine persistence with device side effects (reminders,
 * haptics, the mascot) and kick off a background sync.
 */

function haptic(kind: 'success' | 'light') {
  if (!usePreferencesStore.getState().hapticsEnabled) return;
  void (kind === 'success'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  ).catch(() => undefined);
}

export async function createTask(input: TaskInput) {
  const task = await taskRepository.create(input);
  await syncTaskReminder(task);
  mascot.react('taskAdded');
  haptic('light');
  requestSync('task-created');
  return task;
}

export async function updateTask(id: string, input: Partial<TaskInput>) {
  const task = await taskRepository.update(id, input);
  await syncTaskReminder(task);
  requestSync('task-updated');
  return task;
}

export async function toggleTask(id: string, done: boolean) {
  const { task, next } = await taskRepository.setCompleted(id, done);
  await syncTaskReminder(task);
  if (next) await syncTaskReminder(next);
  if (done) {
    haptic('success');
    const goal = usePreferencesStore.getState().dailyGoal;
    const { doneToday } = await taskRepository.counts();
    mascot.react(doneToday === goal ? 'goalAchieved' : 'taskCompleted');
  }
  requestSync('task-toggled');
  return { task, next };
}

export async function deleteTask(id: string) {
  const task = await taskRepository.get(id);
  if (task) await cancelTaskReminder(task);
  await taskRepository.remove(id);
  requestSync('task-deleted');
}
