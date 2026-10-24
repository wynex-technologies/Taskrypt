import { uuidV5 } from '@/lib/ids';
import { addDays, addMonths } from '@/lib/time';
import type { RecurrenceRule, Task } from '@/types/domain';

/**
 * Next due date strictly after `from` for a rule, or null when the series ended.
 * Times of day are preserved.
 */
export function nextOccurrence(rule: RecurrenceRule, from: Date): Date | null {
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  let next: Date;
  switch (rule.freq) {
    case 'daily':
      next = addDays(from, interval);
      break;
    case 'weekly': {
      const days = (rule.weekdays ?? []).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
      if (days.length === 0) {
        next = addDays(from, 7 * interval);
        break;
      }
      // Later weekday in the same week, otherwise first weekday N weeks on.
      const today = from.getDay();
      const later = days.find((d) => d > today);
      if (later !== undefined) next = addDays(from, later - today);
      else next = addDays(from, 7 * interval - today + days[0]!);
      break;
    }
    case 'monthly':
      next = addMonths(from, interval);
      break;
    case 'custom': {
      const unit = rule.unit ?? 'day';
      next = unit === 'month' ? addMonths(from, interval) : addDays(from, unit === 'week' ? 7 * interval : interval);
      break;
    }
    default:
      return null;
  }
  if (rule.until && next.getTime() > new Date(rule.until).getTime()) return null;
  return next;
}

/**
 * Deterministic id for a series occurrence. Two devices completing the same
 * recurring task offline will generate the SAME next task, which the server
 * merges instead of duplicating.
 */
export function occurrenceId(task: Pick<Task, 'id' | 'recurrence_parent_id'>, dueIso: string): string {
  const root = task.recurrence_parent_id ?? task.id;
  return uuidV5(`occurrence:${root}:${dueIso}`);
}

export function describeRecurrence(rule: RecurrenceRule | null): string {
  if (!rule) return 'Does not repeat';
  const n = Math.max(1, rule.interval);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (rule.freq) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekly': {
      const days = (rule.weekdays ?? []).map((d) => names[d]).join(', ');
      const base = n === 1 ? 'Every week' : `Every ${n} weeks`;
      return days ? `${base} on ${days}` : base;
    }
    case 'monthly':
      return n === 1 ? 'Every month' : `Every ${n} months`;
    case 'custom':
      return `Every ${n} ${rule.unit ?? 'day'}${n === 1 ? '' : 's'}`;
  }
}
