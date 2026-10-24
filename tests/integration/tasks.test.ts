import { getDb } from '@/database';
import { listRepository, tagRepository, taskRepository } from '@/repositories/taskRepository';
import { saveRecord } from '@/repositories/entityStore';
import * as queue from '@/repositories/syncQueueRepository';

import { onDevice, resetAllDevices, USER_A, USER_B } from '../helpers/db';

const at = (iso: string) => jest.setSystemTime(new Date(iso));

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'nextTick', 'setImmediate', 'clearImmediate'] });
  at('2026-10-24T08:00:00.000Z');
  await resetAllDevices();
  await onDevice('phone-a', USER_A);
});

afterEach(() => jest.useRealTimers());

describe('task CRUD (offline, SQLite)', () => {
  it('creates, reads, updates and soft-deletes a task', async () => {
    const t = await taskRepository.create({ title: '  Pay rent  ', priority: 3, due_at: '2026-10-24T12:00:00.000Z' });
    expect(t.title).toBe('Pay rent');
    expect(t.user_id).toBe(USER_A);
    expect(t.sync_state).toBe('pending');

    const read = await taskRepository.get(t.id);
    expect(read).toMatchObject({ title: 'Pay rent', priority: 3, status: 'todo', all_day: false, tags: [] });

    await taskRepository.update(t.id, { title: 'Pay rent (Oct)', description: '  via bank  ' });
    expect((await taskRepository.get(t.id))?.description).toBe('via bank');

    await taskRepository.remove(t.id);
    expect(await taskRepository.get(t.id)).toBeNull();
    const raw = await getDb().first<{ deleted_at: string | null }>('SELECT deleted_at FROM tasks WHERE id = ?', [t.id]);
    expect(raw?.deleted_at).toBeTruthy(); // tombstone kept for sync
  });

  it('records exactly one queued operation per unsent record (coalescing)', async () => {
    const t = await taskRepository.create({ title: 'Draft' });
    await taskRepository.update(t.id, { title: 'Draft 2' });
    await taskRepository.update(t.id, { priority: 2 });
    const ops = (await queue.listAll(getDb())).filter((o) => o.entity === 'tasks');
    expect(ops).toHaveLength(1);
    expect(ops[0]!.payload).toMatchObject({ title: 'Draft 2', priority: 2 });
  });

  it('never mutates an op that may already be on the server (in flight)', async () => {
    const t = await taskRepository.create({ title: 'A' });
    const [first] = await queue.listAll(getDb());
    await queue.markInflight(getDb(), [first!.op_id]);
    await taskRepository.update(t.id, { title: 'B' });
    const ops = await queue.listAll(getDb());
    expect(ops).toHaveLength(2);
    expect(ops[0]!.payload.title).toBe('A');
    expect(ops[1]!.payload.title).toBe('B');
  });

  it('keeps the conflict clock strictly increasing even if the device clock goes backwards', async () => {
    const t = await taskRepository.create({ title: 'clock' });
    at('2026-10-24T07:00:00.000Z');
    const u = await taskRepository.update(t.id, { title: 'clock 2' });
    expect(u.client_updated_at > t.client_updated_at).toBe(true);
  });

  it('filters by view, list, tag, priority and escapes LIKE wildcards', async () => {
    const list = await listRepository.create('Home');
    const tag = await tagRepository.create('#errand');
    expect((await tagRepository.create('Errand')).id).toBe(tag.id); // case-insensitive dedupe
    await taskRepository.create({ title: 'Overdue', due_at: '2026-10-22T09:00:00.000Z', list_id: list.id, tag_ids: [tag.id] });
    await taskRepository.create({ title: 'Today 100%', due_at: '2026-10-24T15:00:00.000Z', priority: 3 });
    await taskRepository.create({ title: 'Next week', due_at: '2026-10-30T09:00:00.000Z' });
    await taskRepository.create({ title: 'Someday 1000' });

    expect((await taskRepository.list({ view: 'today' })).map((t) => t.title).sort()).toEqual(['Overdue', 'Today 100%']);
    expect((await taskRepository.list({ view: 'overdue' })).map((t) => t.title)).toEqual(['Overdue']);
    expect((await taskRepository.list({ view: 'upcoming' })).map((t) => t.title)).toEqual(['Next week']);
    expect((await taskRepository.list({ view: 'nodate' })).map((t) => t.title)).toEqual(['Someday 1000']);
    expect((await taskRepository.list({ listId: list.id }))[0]?.tags.map((g) => g.name)).toEqual(['errand']);
    expect((await taskRepository.list({ tagId: tag.id })).map((t) => t.title)).toEqual(['Overdue']);
    expect((await taskRepository.list({ priorities: [3] })).map((t) => t.title)).toEqual(['Today 100%']);
    expect((await taskRepository.list({ search: '100%' })).map((t) => t.title)).toEqual(['Today 100%']);
    expect(await taskRepository.list({ search: "'; DROP TABLE tasks; --" })).toEqual([]);
    expect((await taskRepository.counts()).overdue).toBe(1);
  });

  it('completes tasks, records history and statistics', async () => {
    const t = await taskRepository.create({ title: 'Run' });
    await taskRepository.setCompleted(t.id, true);
    const done = await taskRepository.list({ view: 'completed' });
    expect(done[0]).toMatchObject({ id: t.id, status: 'done' });
    expect(done[0]!.completed_at).toBeTruthy();
    expect((await taskRepository.counts()).doneToday).toBe(1);
    const series = await taskRepository.completionSeries(7);
    expect(series).toHaveLength(7);
    expect(series.at(-1)!.count).toBe(1);
    await taskRepository.setCompleted(t.id, false);
    expect((await taskRepository.get(t.id))?.completed_at).toBeNull();
  });

  it('materializes the next recurring occurrence with a deterministic id', async () => {
    const t = await taskRepository.create({ title: 'Water plants', due_at: '2026-10-24T09:00:00.000Z', recurrence: { freq: 'daily', interval: 2 } });
    const { next } = await taskRepository.setCompleted(t.id, true);
    expect(next).toBeTruthy();
    expect(new Date(next!.due_at!).toISOString()).toBe('2026-10-26T09:00:00.000Z');
    expect(next!.recurrence_parent_id).toBe(t.id);
    // Completing again (e.g. un-complete then complete) must not create a duplicate.
    await taskRepository.setCompleted(t.id, false);
    const again = await taskRepository.setCompleted(t.id, true);
    expect(again.next).toBeNull();
    expect((await taskRepository.list({ search: 'Water' })).filter((x) => x.status === 'todo')).toHaveLength(1);
  });

  it('uses deterministic tag-assignment ids and restores rather than duplicates', async () => {
    const tag = await tagRepository.create('work');
    const t = await taskRepository.create({ title: 'x', tag_ids: [tag.id] });
    await taskRepository.update(t.id, { tag_ids: [] });
    await taskRepository.update(t.id, { tag_ids: [tag.id, tag.id] });
    const rows = await getDb().all<{ id: string; deleted_at: string | null }>('SELECT id, deleted_at FROM task_tag_assignments WHERE task_id = ?', [t.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).toBeNull();
  });
});

describe('ownership and per-user isolation', () => {
  it('refuses to overwrite a row owned by another user', async () => {
    const t = await taskRepository.create({ title: 'mine' });
    await getDb().run('UPDATE tasks SET user_id = ? WHERE id = ?', [USER_B, t.id]);
    await expect(saveRecord('tasks', t.id, { title: 'hijack' })).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('gives every account its own database file', async () => {
    await taskRepository.create({ title: 'A private' });
    await onDevice('phone-a', USER_B);
    expect(await taskRepository.list({})).toEqual([]);
    await onDevice('phone-a', USER_A);
    expect((await taskRepository.list({})).map((t) => t.title)).toEqual(['A private']);
  });
});
