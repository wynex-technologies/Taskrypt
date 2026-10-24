import { getDb } from '@/database';
import { runSync, type SyncHooks } from '@/features/sync/syncEngine';
import { getDeviceId } from '@/repositories/kvRepository';
import * as queue from '@/repositories/syncQueueRepository';
import { taskRepository } from '@/repositories/taskRepository';
import type { LocalTask } from '@/types/domain';

import { FakeServer } from '../fakes/fakeServer';
import { onDevice, resetAllDevices, USER_A } from '../helpers/db';

const at = (iso: string) => jest.setSystemTime(new Date(iso));
let server: FakeServer;

async function sync(hooks?: SyncHooks) {
  const db = getDb();
  return runSync({ db, remote: server.remote(), deviceId: await getDeviceId(db), hooks });
}

beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'nextTick', 'setImmediate', 'clearImmediate'] });
  at('2026-10-24T08:00:00.000Z');
  await resetAllDevices();
  server = new FakeServer(USER_A);
  await onDevice('phone-a');
});

afterEach(() => jest.useRealTimers());

describe('push', () => {
  it('uploads offline changes and marks them synced', async () => {
    const t = await taskRepository.create({ title: 'Offline task' });
    const report = await sync();
    expect(report).toMatchObject({ pushed: 1, applied: 1, rejected: 0 });
    expect(server.rows('tasks')).toHaveLength(1);
    expect(server.rows('tasks')[0]).toMatchObject({ id: t.id, title: 'Offline task', user_id: USER_A, version: 1 });
    const local = await taskRepository.get(t.id);
    expect(local).toMatchObject({ sync_state: 'synced', version: 1 });
    expect(await queue.listAll(getDb())).toHaveLength(0);
  });

  it('is idempotent when the response is lost (no duplicate rows or versions)', async () => {
    await taskRepository.create({ title: 'once' });
    server.failNext = 'lostResponse';
    await expect(sync()).rejects.toMatchObject({ code: 'network' });
    expect(server.rows('tasks')).toHaveLength(1);
    const [op] = await queue.listAll(getDb());
    expect(op).toMatchObject({ status: 'pending', attempts: 1 });

    at('2026-10-24T08:10:00.000Z'); // past the backoff window
    const report = await sync();
    expect(report.duplicate).toBe(1);
    expect(server.rows('tasks')).toHaveLength(1);
    expect(server.rows('tasks')[0]!.version).toBe(1);
    expect(await queue.listAll(getDb())).toHaveLength(0);
  });

  it('backs off after network failures and retries later', async () => {
    await taskRepository.create({ title: 'retry me' });
    server.failNext = 'network';
    await expect(sync()).rejects.toBeTruthy();
    const [op] = await queue.listAll(getDb());
    expect(op!.attempts).toBe(1);
    expect(new Date(op!.next_attempt_at!).getTime()).toBeGreaterThan(Date.now());

    // Still inside the backoff window: nothing is sent.
    const early = await sync();
    expect(early.pushed).toBe(0);

    at('2026-10-24T09:00:00.000Z');
    expect((await sync()).applied).toBe(1);
  });

  it('marks server-rejected changes as failed instead of retrying forever', async () => {
    const t = await taskRepository.create({ title: 'bad' });
    server.rejectEntity = 'tasks';
    const report = await sync();
    expect(report.rejected).toBe(1);
    const [op] = await queue.listAll(getDb());
    expect(op!.status).toBe('failed');
    expect((await taskRepository.get(t.id))?.sync_state).toBe('failed');
    await queue.retryFailed(getDb());
    server.rejectEntity = null;
    expect((await sync()).applied).toBe(1);
  });

  it('recovers ops left in flight by a crash', async () => {
    await taskRepository.create({ title: 'crash' });
    const [op] = await queue.listAll(getDb());
    await queue.markInflight(getDb(), [op!.op_id]);
    expect((await sync()).applied).toBe(0); // inflight is not "ready"
    await queue.resetInflight(getDb());
    expect((await sync()).applied).toBe(1);
  });
});

describe('pull and conflict resolution', () => {
  it('pulls remote changes, including tombstones', async () => {
    const t = await taskRepository.create({ title: 'shared' });
    await sync();
    server.serverEdit('tasks', t.id, { title: 'edited on web', client_updated_at: '2026-10-24T08:30:00.000Z', last_modified_by: 'web' });
    const pulledRows: unknown[] = [];
    await sync({ onServerRows: async (_, rows) => void pulledRows.push(...rows) });
    expect((await taskRepository.get(t.id))?.title).toBe('edited on web');
    expect(pulledRows).toHaveLength(1);

    server.serverEdit('tasks', t.id, { deleted_at: '2026-10-24T08:40:00.000Z', client_updated_at: '2026-10-24T08:40:00.000Z' });
    await sync();
    expect(await taskRepository.get(t.id)).toBeNull();
  });

  it('two offline devices converge on the latest edit (last writer wins)', async () => {
    const t = await taskRepository.create({ title: 'original' });
    await sync();

    await onDevice('phone-b');
    await sync(); // phone B downloads the task
    expect((await taskRepository.get(t.id))?.title).toBe('original');

    // Both go offline and edit. Phone B edits later.
    await onDevice('phone-a');
    at('2026-10-24T09:00:00.000Z');
    await taskRepository.update(t.id, { title: 'from A' });
    await onDevice('phone-b');
    at('2026-10-24T09:05:00.000Z');
    await taskRepository.update(t.id, { title: 'from B' });

    // B syncs first, then A (whose change is older) — A must lose deterministically.
    await sync();
    await onDevice('phone-a');
    const reportA = await sync();
    expect(reportA.stale).toBe(1);
    expect((await taskRepository.get(t.id))?.title).toBe('from B');

    await onDevice('phone-b');
    await sync();
    expect((await taskRepository.get(t.id))?.title).toBe('from B');
    expect(server.rows('tasks')[0]!.title).toBe('from B');
  });

  it('breaks exact clock ties by device id so every device agrees', async () => {
    const t = await taskRepository.create({ title: 'tie' });
    await sync();
    await onDevice('phone-b');
    await sync();
    const idB = await getDeviceId(getDb());
    await onDevice('phone-a');
    const idA = await getDeviceId(getDb());

    at('2026-10-24T09:00:00.000Z');
    await taskRepository.update(t.id, { title: 'A wins?' });
    await onDevice('phone-b');
    await taskRepository.update(t.id, { title: 'B wins?' });
    await sync();
    await onDevice('phone-a');
    await sync();
    const expected = idA > idB ? 'A wins?' : 'B wins?';
    expect(server.rows('tasks')[0]!.title).toBe(expected);
    expect((await taskRepository.get(t.id))?.title).toBe(expected);
  });

  it('a newer local edit is not overwritten by an older pulled version', async () => {
    const t = await taskRepository.create({ title: 'v1' });
    await sync();
    server.serverEdit('tasks', t.id, { title: 'server old', client_updated_at: '2026-10-24T08:05:00.000Z', last_modified_by: 'web' });
    at('2026-10-24T08:20:00.000Z');
    await taskRepository.update(t.id, { title: 'local newer' });
    await sync();
    expect((await taskRepository.get(t.id))?.title).toBe('local newer');
    expect(server.rows('tasks')[0]!.title).toBe('local newer');
  });

  it('a pull never clobbers a local edit that is still waiting (backoff) to be pushed', async () => {
    const t = await taskRepository.create({ title: 'v1' });
    await sync();
    at('2026-10-24T08:20:00.000Z');
    await taskRepository.update(t.id, { title: 'local pending' });
    server.failNext = 'network';
    await expect(sync()).rejects.toBeTruthy(); // op now in backoff
    server.serverEdit('tasks', t.id, { title: 'remote', client_updated_at: '2026-10-24T08:25:00.000Z', last_modified_by: 'web' });
    await sync(); // push skips (backoff) but pull runs
    expect((await taskRepository.get(t.id))?.title).toBe('local pending');
    at('2026-10-24T09:00:00.000Z');
    await sync(); // now pushed; server's later edit wins deterministically
    expect((await taskRepository.get(t.id))?.title).toBe('remote');
  });

  it('a later edit beats an earlier delete, and a later delete beats an earlier edit', async () => {
    const t = await taskRepository.create({ title: 'contested' });
    await sync();
    await onDevice('phone-b');
    await sync();

    at('2026-10-24T09:00:00.000Z');
    await taskRepository.remove(t.id); // B deletes first
    await onDevice('phone-a');
    at('2026-10-24T09:10:00.000Z');
    await taskRepository.update(t.id, { title: 'still needed' }); // A edits later
    await sync();
    await onDevice('phone-b');
    await sync();
    expect(server.rows('tasks')[0]!.deleted_at).toBeNull();
    expect((await taskRepository.get(t.id))?.title).toBe('still needed');
  });

  it('recurring task completed on two offline devices yields ONE next occurrence', async () => {
    const t = await taskRepository.create({ title: 'Stand-up', due_at: '2026-10-24T09:00:00.000Z', recurrence: { freq: 'daily', interval: 1 } });
    await sync();
    await onDevice('phone-b');
    await sync();

    await taskRepository.setCompleted(t.id, true);
    await onDevice('phone-a');
    at('2026-10-24T08:01:00.000Z');
    await taskRepository.setCompleted(t.id, true);

    await sync();
    await onDevice('phone-b');
    await sync();

    const open = server.rows('tasks').filter((r) => r.status === 'todo' && !r.deleted_at);
    expect(open).toHaveLength(1);
    expect(open[0]!.recurrence_parent_id).toBe(t.id);
    const local = (await taskRepository.list({ view: 'all' })).filter((x: LocalTask) => x.status === 'todo');
    expect(local).toHaveLength(1);
  });

  it('pages through large pulls and advances the cursor', async () => {
    for (let i = 0; i < 520; i++) server.table('task_tags').set(`tag-${i}`, {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      user_id: USER_A, name: `t${i}`, color: '#123456', created_at: '2026-10-01T00:00:00.000Z',
      updated_at: new Date(Date.parse('2026-10-01T00:00:00.000Z') + i * 10).toISOString(),
      client_updated_at: '2026-10-01T00:00:00.000Z', last_modified_by: 'web', deleted_at: null, version: 1,
    });
    const r = await sync();
    expect(r.pulled).toBe(520);
    const again = await sync();
    expect(again.pulled).toBe(0); // overlap window re-reads but echoes are ignored
  });
});
