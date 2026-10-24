// Runs the real Supabase migration on PGlite and verifies row-level security,
// storage policies, validation and the sync_push conflict/idempotency contract.
//   npm run test:server
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db;

/** Run statements as an authenticated user (or anon when uid is null), like PostgREST does. */
async function as(uid, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${uid ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    return fn(tx);
  });
}

// Timestamps relative to the real clock: the server clamps anything > now + 5 min.
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();

const row = (overrides = {}) => ({
  id: randomUUID(),
  created_at: ago(60),
  client_updated_at: ago(60),
  last_modified_by: 'device-a',
  deleted_at: null,
  ...overrides,
});

const task = (o = {}) => row({ title: 'Task', description: null, due_at: null, all_day: false, priority: 1, status: 'todo', completed_at: null, recurrence: null, recurrence_parent_id: null, reminder_offset_minutes: null, position: 1, list_id: null, category_id: null, ...o });

async function push(uid, ops, device = 'device-a') {
  return as(uid, async (tx) => (await tx.query('select public.sync_push($1, $2::jsonb) as r', [device, JSON.stringify(ops)])).rows[0].r);
}

async function expectError(promise, pattern) {
  await assert.rejects(promise, (e) => {
    assert.match(String(e.message), pattern);
    return true;
  });
}

before(async () => {
  db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(here, 'supabaseStubs.sql'), 'utf8'));
  const migrations = readdirSync(join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const m of migrations) await db.exec(readFileSync(join(root, 'supabase', 'migrations', m), 'utf8'));
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.com', '{"display_name":"Ann"}'), ($2, 'b@example.com', '{}')`, [A, B]);
});

describe('profiles', () => {
  it('are created by the auth trigger', async () => {
    const r = await db.query('select id, display_name, storage_quota_bytes from public.profiles order by id');
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].display_name, 'Ann');
  });

  it('are private to their owner and quota cannot be self-raised', async () => {
    const seen = await as(A, (tx) => tx.query('select id from public.profiles'));
    assert.deepEqual(seen.rows.map((x) => x.id), [A]);
    await as(A, (tx) => tx.query(`update public.profiles set display_name = 'Annie' where id = $1`, [A]));
    await expectError(as(A, (tx) => tx.query('update public.profiles set storage_quota_bytes = 999999999999 where id = $1', [A])), /permission denied/);
    const other = await as(A, (tx) => tx.query(`update public.profiles set display_name = 'x' where id = $1 returning id`, [B]));
    assert.equal(other.rows.length, 0);
  });
});

describe('row level security', () => {
  it('isolates every user-owned table', async () => {
    const t = task({ title: 'A secret' });
    const [res] = await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: t }]);
    assert.equal(res.status, 'applied');
    const asB = await as(B, (tx) => tx.query('select * from public.tasks'));
    assert.equal(asB.rows.length, 0);
    const anon = await as(null, (tx) => tx.query('select * from public.tasks').catch((e) => ({ error: e.message })));
    assert.ok(anon.error ? /permission denied/.test(anon.error) : anon.rows.length === 0);
    const upd = await as(B, (tx) => tx.query(`update public.tasks set title = 'pwned' where id = $1 returning id`, [t.id]));
    assert.equal(upd.rows.length, 0);
    const del = await as(B, (tx) => tx.query('delete from public.tasks where id = $1 returning id', [t.id]));
    assert.equal(del.rows.length, 0);
  });

  it('forbids inserting rows for another user', async () => {
    await expectError(
      as(B, (tx) => tx.query(`insert into public.task_tags (id, user_id, name, color, last_modified_by) values ($1, $2, 'x', '#123456', 'd')`, [randomUUID(), A])),
      /row-level security/,
    );
  });

  it('blocks cross-user references with composite foreign keys', async () => {
    const list = row({ name: 'A list', color: '#112233', icon: 'list', position: 1 });
    await push(A, [{ op_id: randomUUID(), entity: 'task_lists', row: list }]);
    const [res] = await push(B, [{ op_id: randomUUID(), entity: 'tasks', row: task({ list_id: list.id }) }]);
    assert.equal(res.status, 'rejected');
    assert.match(res.error, /foreign key/);
  });

  it('cannot change ownership of an existing row', async () => {
    const t = task();
    await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: t }]);
    await expectError(as(A, (tx) => tx.query('update public.tasks set user_id = $1 where id = $2', [B, t.id])), /row-level security|immutable/);
  });
});

describe('sync_push', () => {
  it('forces ownership and server-managed columns', async () => {
    const t = task({ user_id: B, version: 99, updated_at: '1999-01-01T00:00:00Z' });
    const [res] = await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: t }]);
    assert.equal(res.status, 'applied');
    assert.equal(res.row.user_id, A);
    assert.equal(res.row.version, 1);
    assert.notEqual(res.row.updated_at.slice(0, 4), '1999');
  });

  it('is idempotent per op_id', async () => {
    const op = { op_id: randomUUID(), entity: 'tasks', row: task({ title: 'once' }) };
    const [first] = await push(A, [op]);
    const [again] = await push(A, [op]);
    assert.equal(first.status, 'applied');
    assert.equal(again.status, 'duplicate');
    assert.equal(again.row.version, 1);
  });

  it('applies last-writer-wins with a device-id tie-break', async () => {
    const t = task({ title: 'base' });
    const tieAt = ago(30);
    await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: t }]);
    const older = await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: { ...t, title: 'older', client_updated_at: ago(120) } }], 'device-b');
    assert.equal(older[0].status, 'stale');
    assert.equal(older[0].row.title, 'base');
    const newer = await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: { ...t, title: 'newer', client_updated_at: tieAt, last_modified_by: 'device-b' } }], 'device-b');
    assert.equal(newer[0].status, 'applied');
    assert.equal(newer[0].row.version, 2);
    const tieLow = await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: { ...t, title: 'tie-a', client_updated_at: tieAt, last_modified_by: 'device-a' } }]);
    assert.equal(tieLow[0].status, 'stale');
    const tieHigh = await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: { ...t, title: 'tie-c', client_updated_at: tieAt, last_modified_by: 'device-c' } }], 'device-c');
    assert.equal(tieHigh[0].status, 'applied');
  });

  it('cannot overwrite another user row even with a newer clock', async () => {
    const t = task({ title: 'A owns' });
    await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: t }]);
    const [res] = await push(B, [{ op_id: randomUUID(), entity: 'tasks', row: { ...t, title: 'B attack', client_updated_at: '2030-01-01T00:00:00.000Z' } }]);
    assert.equal(res.status, 'rejected');
    const still = await as(A, (tx) => tx.query('select title from public.tasks where id = $1', [t.id]));
    assert.equal(still.rows[0].title, 'A owns');
  });

  it('clamps far-future client clocks', async () => {
    const [res] = await push(A, [{ op_id: randomUUID(), entity: 'tasks', row: task({ client_updated_at: '2099-01-01T00:00:00.000Z' }) }]);
    assert.ok(new Date(res.row.client_updated_at).getFullYear() < 2099);
  });

  it('rejects invalid data per-op without aborting the batch', async () => {
    const good = task({ title: 'good' });
    const res = await push(A, [
      { op_id: randomUUID(), entity: 'tasks', row: task({ title: '' }) },
      { op_id: randomUUID(), entity: 'tasks', row: task({ priority: 9 }) },
      { op_id: randomUUID(), entity: 'tasks', row: task({ status: 'done', completed_at: null }) },
      { op_id: randomUUID(), entity: 'profiles', row: row() },
      { op_id: randomUUID(), entity: 'tasks', row: good },
    ]);
    assert.deepEqual(res.map((r) => r.status), ['rejected', 'rejected', 'rejected', 'rejected', 'applied']);
  });

  it('rejects unauthenticated callers and oversized batches', async () => {
    await expectError(push(null, []), /permission denied|not authenticated/);
    const many = Array.from({ length: 201 }, () => ({ op_id: randomUUID(), entity: 'tasks', row: task() }));
    await expectError(push(A, many), /at most 200/);
  });
});

describe('documents and folders', () => {
  const doc = (uid, o = {}) => {
    const id = o.id ?? randomUUID();
    return row({ id, folder_id: null, name: 'Passport.pdf', storage_key: `${uid}/${id}/${randomUUID()}`, mime_type: 'application/pdf', size_bytes: 1000, checksum_sha256: 'a'.repeat(64), is_favorite: false, encryption_mode: 'standard', upload_status: 'uploaded', ...o });
  };

  it('validates names, MIME types and the storage key shape', async () => {
    const res = await push(A, [
      { op_id: randomUUID(), entity: 'documents', row: doc(A, { name: '../../etc/passwd' }) },
      { op_id: randomUUID(), entity: 'documents', row: doc(A, { mime_type: 'application/x-msdownload' }) },
      { op_id: randomUUID(), entity: 'documents', row: doc(A, { storage_key: `${B}/x/y` }) },
      { op_id: randomUUID(), entity: 'documents', row: doc(A, { name: 'ok\u0007.pdf' }) },
      { op_id: randomUUID(), entity: 'documents', row: doc(A) },
    ]);
    assert.deepEqual(res.map((r) => r.status), ['rejected', 'rejected', 'rejected', 'rejected', 'applied']);
  });

  it('enforces the per-user storage quota', async () => {
    await db.query('update public.profiles set storage_quota_bytes = 5000 where id = $1', [B]);
    const ok = await push(B, [{ op_id: randomUUID(), entity: 'documents', row: doc(B, { size_bytes: 4000 }) }]);
    assert.equal(ok[0].status, 'applied');
    const over = await push(B, [{ op_id: randomUUID(), entity: 'documents', row: doc(B, { size_bytes: 2000 }) }]);
    assert.equal(over[0].status, 'rejected');
    assert.match(over[0].error, /storage quota/);
    const usage = await as(B, (tx) => tx.query('select * from public.get_storage_usage()'));
    assert.equal(Number(usage.rows[0].used_bytes), 4000);
  });

  it('prevents folder cycles', async () => {
    const f1 = row({ parent_id: null, name: 'One', color: '#111111' });
    const f2 = row({ parent_id: f1.id, name: 'Two', color: '#111111' });
    await push(A, [
      { op_id: randomUUID(), entity: 'document_folders', row: f1 },
      { op_id: randomUUID(), entity: 'document_folders', row: f2 },
    ]);
    const [res] = await push(A, [{ op_id: randomUUID(), entity: 'document_folders', row: { ...f1, parent_id: f2.id, client_updated_at: ago(10) } }]);
    assert.equal(res.status, 'rejected');
    assert.match(res.error, /inside itself/);
  });
});

describe('private storage bucket', () => {
  it('is private with a size limit and MIME allow-list', async () => {
    const b = (await db.query(`select * from storage.buckets where id = 'vault'`)).rows[0];
    assert.equal(b.public, false);
    assert.equal(Number(b.file_size_limit), 52428800);
    assert.ok(b.allowed_mime_types.includes('application/pdf'));
    assert.ok(!b.allowed_mime_types.includes('application/x-msdownload'));
  });

  it('lets users write and read only under their own prefix', async () => {
    const mine = `${A}/${randomUUID()}/${randomUUID()}`;
    await as(A, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('vault', $1)`, [mine]));
    await expectError(as(A, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('vault', $1)`, [`${B}/${randomUUID()}/${randomUUID()}`])), /row-level security/);
    await expectError(as(A, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('vault', $1)`, [`${A}/../../${B}/x`])), /row-level security/);
    const bSees = await as(B, (tx) => tx.query(`select name from storage.objects where name = $1`, [mine]));
    assert.equal(bSees.rows.length, 0);
    const bDeletes = await as(B, (tx) => tx.query(`delete from storage.objects where name = $1 returning id`, [mine]));
    assert.equal(bDeletes.rows.length, 0);
    const aSees = await as(A, (tx) => tx.query(`select name from storage.objects where name = $1`, [mine]));
    assert.equal(aSees.rows.length, 1);
  });
});

describe('account deletion cascade', () => {
  it('removes every row owned by the deleted auth user', async () => {
    const C = randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, 'c@example.com')`, [C]);
    await push(C, [{ op_id: randomUUID(), entity: 'tasks', row: task() }]);
    await db.query('delete from auth.users where id = $1', [C]);
    for (const t of ['profiles', 'tasks', 'sync_operations', 'device_sync_state']) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      const n = await db.query(`select count(*)::int as n from public.${t} where ${col} = $1`, [C]);
      assert.equal(n.rows[0].n, 0, t);
    }
  });
});
