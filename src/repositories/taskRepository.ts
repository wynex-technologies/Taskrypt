import { getDb } from '@/database';
import type { Db } from '@/database/db';
import { emitChange } from '@/database/changes';
import { occurrenceId, nextOccurrence } from '@/features/tasks/recurrence';
import { uuid, uuidV5 } from '@/lib/ids';
import { addDays, dayKey, endOfDay, nowIso, startOfDay } from '@/lib/time';
import type { LocalTask, Priority, RecurrenceRule, Task, TaskCategory, TaskList, TaskTag, TaskTagAssignment } from '@/types/domain';

import { decodeRow } from './entities';
import { findAll, findById, saveRecord, softDelete } from './entityStore';

export type TaskView = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'nodate';
export type TaskSort = 'smart' | 'due' | 'priority' | 'created' | 'title';

export type TaskFilter = {
  view?: TaskView;
  listId?: string | null;
  categoryId?: string | null;
  tagId?: string | null;
  priorities?: Priority[];
  search?: string;
  sort?: TaskSort;
  from?: string;
  to?: string;
  limit?: number;
};

export type TaskInput = {
  title: string;
  description?: string | null;
  due_at?: string | null;
  all_day?: boolean;
  priority?: Priority;
  list_id?: string | null;
  category_id?: string | null;
  recurrence?: RecurrenceRule | null;
  reminder_offset_minutes?: number | null;
  tag_ids?: string[];
};

export type TaskWithTags = LocalTask & { tags: TaskTag[] };

const ORDER: Record<TaskSort, string> = {
  smart: "CASE status WHEN 'todo' THEN 0 ELSE 1 END, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, priority DESC, position ASC, created_at ASC",
  due: 'CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, priority DESC',
  priority: 'priority DESC, CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC',
  created: 'created_at DESC',
  title: 'title COLLATE NOCASE ASC',
};

/** Escape LIKE wildcards so a search for "100%" means the literal string. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function buildTaskQuery(filter: TaskFilter, now = new Date()): { sql: string; params: (string | number)[] } {
  const where: string[] = ['t.deleted_at IS NULL'];
  const params: (string | number)[] = [];
  const sod = startOfDay(now).toISOString();
  const eod = endOfDay(now).toISOString();

  switch (filter.view ?? 'all') {
    case 'today':
      where.push("t.status = 'todo' AND t.due_at IS NOT NULL AND t.due_at <= ?");
      params.push(eod);
      break;
    case 'upcoming':
      where.push("t.status = 'todo' AND t.due_at > ?");
      params.push(eod);
      break;
    case 'overdue':
      where.push("t.status = 'todo' AND t.due_at IS NOT NULL AND t.due_at < ?");
      params.push(sod);
      break;
    case 'completed':
      where.push("t.status = 'done'");
      break;
    case 'nodate':
      where.push("t.status = 'todo' AND t.due_at IS NULL");
      break;
    case 'all':
      break;
  }
  if (filter.listId) {
    where.push('t.list_id = ?');
    params.push(filter.listId);
  }
  if (filter.categoryId) {
    where.push('t.category_id = ?');
    params.push(filter.categoryId);
  }
  if (filter.tagId) {
    where.push('EXISTS (SELECT 1 FROM task_tag_assignments a WHERE a.task_id = t.id AND a.tag_id = ? AND a.deleted_at IS NULL)');
    params.push(filter.tagId);
  }
  if (filter.priorities && filter.priorities.length > 0) {
    where.push(`t.priority IN (${filter.priorities.map(() => '?').join(',')})`);
    params.push(...filter.priorities);
  }
  if (filter.search?.trim()) {
    where.push("(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')");
    const p = likePattern(filter.search.trim());
    params.push(p, p);
  }
  if (filter.from) {
    where.push('t.due_at >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('t.due_at <= ?');
    params.push(filter.to);
  }
  const sort = filter.view === 'completed' ? 'completed_at DESC' : ORDER[filter.sort ?? 'smart'];
  const limit = filter.limit ? ` LIMIT ${Math.max(1, Math.min(1000, Math.floor(filter.limit)))}` : '';
  return { sql: `SELECT t.* FROM tasks t WHERE ${where.join(' AND ')} ORDER BY ${sort}${limit}`, params };
}

async function attachTags(db: Db, tasks: LocalTask[]): Promise<TaskWithTags[]> {
  if (tasks.length === 0) return [];
  const ids = tasks.map((t) => t.id);
  const rows = await db.all<Record<string, unknown> & { task_id: string }>(
    `SELECT g.*, a.task_id AS task_id FROM task_tag_assignments a
     JOIN task_tags g ON g.id = a.tag_id AND g.deleted_at IS NULL
     WHERE a.deleted_at IS NULL AND a.task_id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  const byTask = new Map<string, TaskTag[]>();
  for (const r of rows) {
    const { task_id, ...tag } = r;
    const list = byTask.get(task_id) ?? [];
    list.push(decodeRow<TaskTag>('task_tags', { ...tag, id: tag.id }));
    byTask.set(task_id, list);
  }
  return tasks.map((t) => ({ ...t, tags: byTask.get(t.id) ?? [] }));
}

export const taskRepository = {
  async list(filter: TaskFilter = {}): Promise<TaskWithTags[]> {
    const db = getDb();
    const { sql, params } = buildTaskQuery(filter);
    const rows = await db.all<Record<string, unknown>>(sql, params);
    return attachTags(db, rows.map((r) => decodeRow<LocalTask>('tasks', r)));
  },

  async get(id: string): Promise<TaskWithTags | null> {
    const db = getDb();
    const t = await findById<LocalTask>('tasks', id, db);
    if (!t || t.deleted_at) return null;
    const [withTags] = await attachTags(db, [t]);
    return withTags ?? null;
  },

  async create(input: TaskInput, id: string = uuid()): Promise<LocalTask> {
    const db = getDb();
    return db.transaction(async (tx) => {
      const maxPos = await tx.first<{ p: number | null }>('SELECT MAX(position) AS p FROM tasks');
      const task = await saveRecord<LocalTask>(
        'tasks',
        id,
        {
          title: input.title.trim(),
          description: input.description?.trim() || null,
          due_at: input.due_at ?? null,
          all_day: input.all_day ?? false,
          priority: input.priority ?? 1,
          status: 'todo',
          completed_at: null,
          list_id: input.list_id ?? null,
          category_id: input.category_id ?? null,
          recurrence: input.recurrence ?? null,
          recurrence_parent_id: null,
          reminder_offset_minutes: input.reminder_offset_minutes ?? null,
          position: (maxPos?.p ?? 0) + 1,
        },
        { tx, silent: true },
      );
      await setTags(tx, id, input.tag_ids ?? []);
      emitChange('tasks', 'tags', 'sync');
      return task;
    });
  },

  async update(id: string, input: Partial<TaskInput>): Promise<LocalTask> {
    const db = getDb();
    return db.transaction(async (tx) => {
      const { tag_ids, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if (typeof patch.title === 'string') patch.title = (patch.title as string).trim();
      if ('description' in patch) patch.description = (patch.description as string | null)?.trim() || null;
      const task = await saveRecord<LocalTask>('tasks', id, patch, { tx, silent: true });
      if (tag_ids) await setTags(tx, id, tag_ids);
      emitChange('tasks', 'tags', 'sync');
      return task;
    });
  },

  /**
   * Toggle completion. Completing a recurring task also materializes the next
   * occurrence (deterministic id) so the series continues offline.
   */
  async setCompleted(id: string, done: boolean): Promise<{ task: LocalTask; next: LocalTask | null }> {
    const db = getDb();
    return db.transaction(async (tx) => {
      const current = await findById<LocalTask>('tasks', id, tx);
      if (!current || current.deleted_at) throw new Error('Task not found');
      const task = await saveRecord<LocalTask>(
        'tasks',
        id,
        { status: done ? 'done' : 'todo', completed_at: done ? nowIso() : null },
        { tx, silent: true },
      );
      let next: LocalTask | null = null;
      if (done && current.recurrence) {
        const base = current.due_at ? new Date(current.due_at) : new Date();
        let due = nextOccurrence(current.recurrence, base);
        // Skip occurrences that are already in the past (e.g. completing a week late).
        const today = startOfDay(new Date());
        while (due && due < today) due = nextOccurrence(current.recurrence, due);
        if (due) {
          const dueIso = due.toISOString();
          const nextId = occurrenceId(current, dueIso);
          const exists = await findById<LocalTask>('tasks', nextId, tx);
          if (!exists) {
            next = await saveRecord<LocalTask>(
              'tasks',
              nextId,
              {
                title: current.title,
                description: current.description,
                due_at: dueIso,
                all_day: current.all_day,
                priority: current.priority,
                status: 'todo',
                completed_at: null,
                list_id: current.list_id,
                category_id: current.category_id,
                recurrence: current.recurrence,
                recurrence_parent_id: current.recurrence_parent_id ?? current.id,
                reminder_offset_minutes: current.reminder_offset_minutes,
                position: current.position,
              },
              { tx, silent: true },
            );
            const tagRows = await tx.all<{ tag_id: string }>(
              'SELECT tag_id FROM task_tag_assignments WHERE task_id = ? AND deleted_at IS NULL',
              [id],
            );
            await setTags(tx, nextId, tagRows.map((r) => r.tag_id));
          }
        }
      }
      emitChange('tasks', 'sync');
      return { task, next };
    });
  },

  async setNotificationIds(id: string, ids: string[]): Promise<void> {
    // Device-only column: no sync operation.
    await getDb().run('UPDATE tasks SET notification_ids = ? WHERE id = ?', [JSON.stringify(ids), id]);
  },

  async remove(id: string): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      await softDelete('tasks', id, tx);
      const assignments = await tx.all<{ id: string }>('SELECT id FROM task_tag_assignments WHERE task_id = ? AND deleted_at IS NULL', [id]);
      for (const a of assignments) await softDelete('task_tag_assignments', a.id, tx);
    });
    emitChange('tasks', 'tags', 'sync');
  },

  async withReminders(): Promise<LocalTask[]> {
    return findAll<LocalTask>(
      'tasks',
      "deleted_at IS NULL AND status = 'todo' AND due_at IS NOT NULL AND reminder_offset_minutes IS NOT NULL",
    );
  },

  async counts(now = new Date()) {
    const db = getDb();
    const sod = startOfDay(now).toISOString();
    const eod = endOfDay(now).toISOString();
    const r = await db.first<{ today: number; overdue: number; upcoming: number; open: number; done_today: number; due_today_total: number }>(
      `SELECT
        SUM(CASE WHEN status='todo' AND due_at IS NOT NULL AND due_at <= ? THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN status='todo' AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN status='todo' AND due_at > ? THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status='done' AND completed_at >= ? AND completed_at <= ? THEN 1 ELSE 0 END) AS done_today,
        SUM(CASE WHEN due_at >= ? AND due_at <= ? THEN 1 ELSE 0 END) AS due_today_total
       FROM tasks WHERE deleted_at IS NULL`,
      [eod, sod, eod, sod, eod, sod, eod],
    );
    return {
      today: r?.today ?? 0,
      overdue: r?.overdue ?? 0,
      upcoming: r?.upcoming ?? 0,
      open: r?.open ?? 0,
      doneToday: r?.done_today ?? 0,
      dueTodayTotal: r?.due_today_total ?? 0,
    };
  },

  /** Completed-per-day series for the statistics screen (local calendar days). */
  async completionSeries(days: number, now = new Date()): Promise<{ day: string; count: number }[]> {
    const from = startOfDay(addDays(now, -(days - 1)));
    const rows = await getDb().all<{ completed_at: string }>(
      "SELECT completed_at FROM tasks WHERE deleted_at IS NULL AND status = 'done' AND completed_at >= ?",
      [from.toISOString()],
    );
    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) buckets.set(dayKey(addDays(from, i)), 0);
    for (const r of rows) {
      const k = dayKey(new Date(r.completed_at));
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([day, count]) => ({ day, count }));
  },

  async priorityBreakdown(): Promise<{ priority: Priority; open: number; done: number }[]> {
    const rows = await getDb().all<{ priority: Priority; open: number; done: number }>(
      `SELECT priority, SUM(CASE WHEN status='todo' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done
       FROM tasks WHERE deleted_at IS NULL GROUP BY priority ORDER BY priority`,
    );
    return ([0, 1, 2, 3] as Priority[]).map((p) => rows.find((r) => r.priority === p) ?? { priority: p, open: 0, done: 0 });
  },

  /** Dates in [from, to] that have at least one open task, for calendar dots. */
  async dueDays(from: Date, to: Date): Promise<Map<string, { open: number; done: number }>> {
    const rows = await getDb().all<{ due_at: string; status: string }>(
      'SELECT due_at, status FROM tasks WHERE deleted_at IS NULL AND due_at >= ? AND due_at <= ?',
      [from.toISOString(), to.toISOString()],
    );
    const map = new Map<string, { open: number; done: number }>();
    for (const r of rows) {
      const k = dayKey(new Date(r.due_at));
      const v = map.get(k) ?? { open: 0, done: 0 };
      if (r.status === 'done') v.done++;
      else v.open++;
      map.set(k, v);
    }
    return map;
  },
};

/** Replace a task's tag set using deterministic assignment ids (no duplicates across devices). */
export async function setTags(tx: Db, taskId: string, tagIds: string[]): Promise<void> {
  const wanted = new Set(tagIds);
  const existing = await tx.all<TaskTagAssignment>('SELECT * FROM task_tag_assignments WHERE task_id = ?', [taskId]);
  for (const a of existing) {
    const keep = wanted.has(a.tag_id);
    if (!keep && !a.deleted_at) await softDelete('task_tag_assignments', a.id, tx);
    if (keep && a.deleted_at) await saveRecord('task_tag_assignments', a.id, { deleted_at: null }, { tx, silent: true });
    wanted.delete(a.tag_id);
  }
  for (const tagId of wanted) {
    const id = uuidV5(`tag-assignment:${taskId}:${tagId}`);
    await saveRecord('task_tag_assignments', id, { task_id: taskId, tag_id: tagId, deleted_at: null }, { tx, silent: true });
  }
}

const DEFAULT_COLORS = ['#B9502B', '#5E8A6B', '#3F72AF', '#C98F22', '#7B5EA7', '#C2333F', '#2F7F7A'];

export const listRepository = {
  list: () => findAll<TaskList>('task_lists', 'deleted_at IS NULL', [], 'position ASC, name COLLATE NOCASE'),
  async create(name: string, color = DEFAULT_COLORS[0]!, icon = 'list'): Promise<TaskList> {
    const max = await getDb().first<{ p: number | null }>('SELECT MAX(position) AS p FROM task_lists');
    return saveRecord<TaskList>('task_lists', uuid(), { name: name.trim(), color, icon, position: (max?.p ?? 0) + 1 });
  },
  update: (id: string, patch: Partial<Pick<TaskList, 'name' | 'color' | 'icon' | 'position'>>) => saveRecord<TaskList>('task_lists', id, patch),
  async remove(id: string) {
    await getDb().transaction(async (tx) => {
      await softDelete('task_lists', id, tx);
      // Tasks survive their list; they simply become un-listed.
      const tasks = await tx.all<{ id: string }>('SELECT id FROM tasks WHERE list_id = ? AND deleted_at IS NULL', [id]);
      for (const t of tasks) await saveRecord('tasks', t.id, { list_id: null }, { tx, silent: true });
    });
    emitChange('lists', 'tasks', 'sync');
  },
};

export const categoryRepository = {
  list: () => findAll<TaskCategory>('task_categories', 'deleted_at IS NULL', [], 'name COLLATE NOCASE'),
  create: (name: string, color = DEFAULT_COLORS[1]!) => saveRecord<TaskCategory>('task_categories', uuid(), { name: name.trim(), color }),
  update: (id: string, patch: Partial<Pick<TaskCategory, 'name' | 'color'>>) => saveRecord<TaskCategory>('task_categories', id, patch),
  async remove(id: string) {
    await getDb().transaction(async (tx) => {
      await softDelete('task_categories', id, tx);
      const tasks = await tx.all<{ id: string }>('SELECT id FROM tasks WHERE category_id = ? AND deleted_at IS NULL', [id]);
      for (const t of tasks) await saveRecord('tasks', t.id, { category_id: null }, { tx, silent: true });
    });
    emitChange('categories', 'tasks', 'sync');
  },
};

export const tagRepository = {
  list: () => findAll<TaskTag>('task_tags', 'deleted_at IS NULL', [], 'name COLLATE NOCASE'),
  async create(name: string, color = DEFAULT_COLORS[2]!): Promise<TaskTag> {
    const clean = name.trim().replace(/^#/, '');
    const dup = await getDb().first<Record<string, unknown>>(
      'SELECT * FROM task_tags WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE',
      [clean],
    );
    if (dup) return decodeRow<TaskTag>('task_tags', dup);
    return saveRecord<TaskTag>('task_tags', uuid(), { name: clean, color });
  },
  async remove(id: string) {
    await getDb().transaction(async (tx) => {
      await softDelete('task_tags', id, tx);
      const rows = await tx.all<{ id: string }>('SELECT id FROM task_tag_assignments WHERE tag_id = ? AND deleted_at IS NULL', [id]);
      for (const r of rows) await softDelete('task_tag_assignments', r.id, tx);
    });
    emitChange('tags', 'tasks', 'sync');
  },
};

export const TAG_COLORS = DEFAULT_COLORS;
export type { Task };
