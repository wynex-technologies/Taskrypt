import * as DocumentPicker from 'expo-document-picker';

import { getDb } from '@/database';
import { cancelUpload, deleteDocuments, makeAvailableOffline, openPlaintext, pickAndImport, processVaultJobs, removeOfflineCopy } from '@/features/documents/vaultService';
import { offlineFile } from '@/features/documents/vaultPaths';
import { documentRepository } from '@/repositories/documentRepository';
import * as queue from '@/repositories/syncQueueRepository';
import { nobleProvider, setAeadProvider } from '@/services/encryption/aead';

import { __fs, __remote, __upload, File } from '../fakes/fileSystem';
import { onDevice, resetAllDevices, USER_A } from '../helpers/db';

const mockStorage = {
  createSignedUrl: jest.fn(async (key: string) => ({ data: { signedUrl: `https://test-project.supabase.co/storage/v1/object/sign/vault/${encodeURIComponent(key)}?token=t` }, error: null })),
  remove: jest.fn(async () => ({ error: null })),
  copy: jest.fn(async () => ({ error: null })),
};

jest.mock('@/services/supabase/client', () => ({
  getSupabase: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-access-token' } }, error: null }) },
    storage: { from: () => mockStorage },
  }),
  isSupabaseConfigured: () => true,
}));

const PDF = new TextEncoder().encode('%PDF-1.7\n' + 'Confidential passport scan '.repeat(400));
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

function pick(...assets: { name: string; bytes: Uint8Array }[]) {
  const picked = assets.map((a, i) => {
    const f = new File(`file:///cache/picker/${i}-${a.name}`);
    f.write(a.bytes);
    return { uri: f.uri, name: a.name, size: a.bytes.length, mimeType: 'application/octet-stream' };
  });
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: picked });
}

const includes = (hay: Uint8Array, needle: string) => Buffer.from(hay).includes(Buffer.from(needle));

beforeAll(() => setAeadProvider(nobleProvider));

beforeEach(async () => {
  __fs.reset();
  __remote.clear();
  await resetAllDevices();
  await onDevice('phone-a', USER_A);
});

describe('document import → encrypted staging → upload', () => {
  it('stages an encrypted copy and queues an upload, then uploads the exact bytes', async () => {
    pick({ name: '../../Passport.pdf', bytes: PDF });
    const r = await pickAndImport(null);
    expect(r.rejected).toEqual([]);
    expect(r.imported).toHaveLength(1);
    const doc = r.imported[0]!;
    expect(doc.name).toBe('Passport.pdf');
    expect(doc.upload_status).toBe('pending');
    expect(doc.storage_key.startsWith(`${USER_A}/${doc.id}/`)).toBe(true);

    // The picker's plaintext cache copy is gone; the staged file is ciphertext.
    expect([...__fs.files.keys()].some((k) => k.includes('/picker/'))).toBe(false);
    const staged = __fs.files.get(doc.local_staged_path!)!;
    expect(includes(staged, 'Confidential passport')).toBe(false);

    // Metadata is NOT queued for sync until the binary exists on the server.
    const before = await queue.listAll(getDb());
    expect(before.map((q) => q.kind)).toEqual(['upload']);

    let uploaded: Uint8Array | null = null;
    let headers: Record<string, string> = {};
    __upload.handler = async (url, options, body) => {
      expect(url).toContain(`/storage/v1/object/vault/${USER_A}/${doc.id}/`);
      headers = options.headers as Record<string, string>;
      uploaded = body;
      return { status: 200, body: '{"Key":"ok"}', headers: {} };
    };
    await processVaultJobs(getDb());
    expect(Buffer.from(uploaded!).equals(Buffer.from(PDF))).toBe(true);
    expect(headers.Authorization).toBe('Bearer test-access-token');
    expect(headers['x-upsert']).toBe('false');

    const after = (await documentRepository.get(doc.id))!;
    expect(after).toMatchObject({ upload_status: 'uploaded', offline_status: 'available', local_staged_path: null });
    const ops = await queue.listAll(getDb());
    expect(ops.map((q) => `${q.kind}:${q.op}`)).toEqual(['row:upsert']);
    // Temp plaintext used for the upload was removed.
    expect([...__fs.files.keys()].some((k) => k.startsWith('file:///cache/taskora-tmp'))).toBe(false);
  });

  it('rejects disguised and unsupported files but keeps valid ones from the same pick', async () => {
    pick({ name: 'invoice.pdf', bytes: EXE }, { name: 'tool.exe', bytes: EXE }, { name: 'ok.pdf', bytes: PDF });
    const r = await pickAndImport(null);
    expect(r.imported.map((d) => d.name)).toEqual(['ok.pdf']);
    expect(r.rejected.map((x) => x.name)).toEqual(['invoice.pdf', 'tool.exe']);
  });

  it('treats a 409 duplicate as success (retry after a lost response)', async () => {
    pick({ name: 'a.pdf', bytes: PDF });
    const { imported } = await pickAndImport(null);
    __upload.handler = async () => ({ status: 409, body: '{"error":"Duplicate","message":"The resource already exists"}', headers: {} });
    await processVaultJobs(getDb());
    expect((await documentRepository.get(imported[0]!.id))?.upload_status).toBe('uploaded');
  });

  it('keeps the upload queued with backoff on network failure', async () => {
    pick({ name: 'a.pdf', bytes: PDF });
    const { imported } = await pickAndImport(null);
    __upload.handler = async () => {
      throw new Error('Network request failed');
    };
    await expect(processVaultJobs(getDb())).rejects.toMatchObject({ code: 'network' });
    const [job] = await queue.listAll(getDb());
    expect(job).toMatchObject({ kind: 'upload', status: 'pending', attempts: 1 });
    expect((await documentRepository.get(imported[0]!.id))?.upload_status).toBe('pending');
  });

  it('can cancel a queued upload and the document is marked failed', async () => {
    pick({ name: 'a.pdf', bytes: PDF });
    const { imported } = await pickAndImport(null);
    cancelUpload(imported[0]!.id);
    await new Promise((r) => setTimeout(r, 10));
    expect(await queue.listAll(getDb())).toHaveLength(0);
    expect((await documentRepository.get(imported[0]!.id))?.upload_error).toBe('Upload cancelled');
  });
});

describe('offline documents', () => {
  async function uploadedDoc() {
    pick({ name: 'Lease.pdf', bytes: PDF });
    const { imported } = await pickAndImport(null);
    let stored: Uint8Array | null = null;
    __upload.handler = async (_u, _o, body) => ((stored = body), { status: 200, body: '{}', headers: {} });
    await processVaultJobs(getDb());
    __remote.set(imported[0]!.storage_key, stored!);
    return (await documentRepository.get(imported[0]!.id))!;
  }

  it('opens the encrypted offline copy without any network', async () => {
    const doc = await uploadedDoc();
    mockStorage.createSignedUrl.mockClear();
    const opened = await openPlaintext(doc);
    expect(Buffer.from(await opened.file.bytes()).equals(Buffer.from(PDF))).toBe(true);
    expect(mockStorage.createSignedUrl).not.toHaveBeenCalled();
    opened.release();
    expect(opened.file.exists).toBe(false);
  });

  it('removes and re-downloads an offline copy with integrity verification', async () => {
    const doc = await uploadedDoc();
    await removeOfflineCopy(doc);
    expect(offlineFile(USER_A, doc.id).exists).toBe(false);
    const fresh = (await documentRepository.get(doc.id))!;
    expect(fresh.offline_status).toBe('none');

    await makeAvailableOffline(fresh);
    const now = (await documentRepository.get(doc.id))!;
    expect(now.offline_status).toBe('available');
    const enc = __fs.files.get(offlineFile(USER_A, doc.id).uri)!;
    expect(includes(enc, 'Confidential passport')).toBe(false);
    expect(mockStorage.createSignedUrl).toHaveBeenCalledWith(doc.storage_key, 60);
  });

  it('refuses a download whose checksum does not match', async () => {
    const doc = await uploadedDoc();
    await removeOfflineCopy(doc);
    const tampered = PDF.slice();
    tampered[100] = 0x41;
    __remote.set(doc.storage_key, tampered);
    await expect(makeAvailableOffline((await documentRepository.get(doc.id))!)).rejects.toMatchObject({ code: 'file_corrupted' });
    expect((await documentRepository.get(doc.id))?.offline_status).toBe('error');
  });

  it('delete removes local copies and schedules server object removal after the tombstone syncs', async () => {
    const doc = await uploadedDoc();
    await queue.complete(getDb(), (await queue.listAll(getDb())).map((q) => q.op_id));
    await deleteDocuments([doc]);
    expect(offlineFile(USER_A, doc.id).exists).toBe(false);
    expect(await documentRepository.get(doc.id)).toBeNull();
    const kinds = (await queue.listAll(getDb())).map((q) => `${q.kind}:${q.op}`);
    expect(kinds).toEqual(['row:delete', 'delete_object:delete_object']);
    // Object deletion waits for the tombstone row to be pushed.
    await processVaultJobs(getDb());
    expect(mockStorage.remove).not.toHaveBeenCalled();
  });
});
