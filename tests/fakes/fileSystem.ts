/**
 * In-memory stand-in for expo-file-system's File/Directory API — enough for the
 * vault code paths (handles, digest, move, delete) to run unchanged in Jest.
 */
import { createHash } from 'node:crypto';

const files = new Map<string, Uint8Array>();
const dirs = new Set<string>();

const join = (...parts: (string | { uri: string })[]) =>
  parts
    .map((p) => (typeof p === 'string' ? p : p.uri))
    .join('/')
    .replace(/(?<!:)\/{2,}/g, '/');

export const __fs = { files, dirs, reset: () => (files.clear(), dirs.clear()) };

type UploadHandler = (url: string, options: Record<string, unknown>, body: Uint8Array) => Promise<{ status: number; body: string; headers: Record<string, string> }>;
export const __remote = new Map<string, Uint8Array>();

export const __upload: { handler: UploadHandler } = {
  handler: async () => ({ status: 200, body: '{}', headers: {} }),
};

export class Directory {
  uri: string;
  constructor(...uris: (string | { uri: string })[]) {
    this.uri = join(...uris);
  }
  get exists() {
    return dirs.has(this.uri);
  }
  get name() {
    return this.uri.split('/').pop() ?? '';
  }
  get parentDirectory() {
    return new Directory(this.uri.split('/').slice(0, -1).join('/'));
  }
  create() {
    dirs.add(this.uri);
  }
  delete() {
    for (const k of [...files.keys()]) if (k.startsWith(this.uri + '/')) files.delete(k);
    for (const d of [...dirs]) if (d === this.uri || d.startsWith(this.uri + '/')) dirs.delete(d);
  }
  list() {
    return [...files.keys()].filter((k) => k.startsWith(this.uri + '/')).map((k) => new File(k));
  }
}

export class File {
  /** Fake network download: the URL path after /object/sign/<bucket>/ is looked up in __remote. */
  static async downloadFileAsync(url: string, dest: File | Directory) {
    const key = decodeURIComponent(url.split('?')[0]!.split('/vault/')[1] ?? '');
    const body = __remote.get(key);
    if (!body) throw new Error('404 not found');
    const target = dest instanceof File ? dest : new File(dest, 'download');
    files.set(target.uri, body.slice());
    return target;
  }
  uri: string;
  constructor(...uris: (string | { uri: string })[]) {
    this.uri = join(...uris);
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.get(this.uri)?.length ?? 0;
  }
  get name() {
    return this.uri.split('/').pop() ?? '';
  }
  get parentDirectory() {
    return new Directory(this.uri.split('/').slice(0, -1).join('/'));
  }
  create() {
    files.set(this.uri, new Uint8Array(0));
  }
  delete() {
    files.delete(this.uri);
  }
  write(content: string | Uint8Array) {
    files.set(this.uri, typeof content === 'string' ? new TextEncoder().encode(content) : content.slice());
  }
  async bytes() {
    return (files.get(this.uri) ?? new Uint8Array(0)).slice();
  }
  async text() {
    return new TextDecoder().decode(files.get(this.uri));
  }
  async digest() {
    return createHash('sha256').update(files.get(this.uri) ?? new Uint8Array(0)).digest('hex');
  }
  async copy(dest: File) {
    if (!files.has(this.uri)) throw new Error('source missing');
    files.set(dest.uri, files.get(this.uri)!.slice());
  }
  move(dest: File) {
    files.set(dest.uri, files.get(this.uri) ?? new Uint8Array(0));
    files.delete(this.uri);
    this.uri = dest.uri;
  }
  /** Uploads are delegated to a test-controlled handler. */
  createUploadTask(url: string, options: Record<string, unknown>) {
    const file = this;
    let listener: ((p: { bytesSent: number; totalBytes: number }) => void) | null = null;
    return {
      addListener: (_: string, l: typeof listener) => ((listener = l), { remove() {} }),
      cancel: () => undefined,
      uploadAsync: async () => {
        listener?.({ bytesSent: file.size, totalBytes: file.size });
        return __upload.handler(url, options, (files.get(file.uri) ?? new Uint8Array(0)).slice());
      },
    };
  }
  open() {
    const uri = this.uri;
    const handle = {
      offset: 0 as number | null,
      get size() {
        return files.get(uri)?.length ?? 0;
      },
      readBytesSync(n: number) {
        const buf = files.get(uri) ?? new Uint8Array(0);
        const o = handle.offset ?? 0;
        handle.offset = o + n;
        return buf.slice(o, o + n);
      },
      async readBytes(n: number) {
        return handle.readBytesSync(n);
      },
      async writeBytes(bytes: Uint8Array) {
        const cur = files.get(uri) ?? new Uint8Array(0);
        const next = new Uint8Array(cur.length + bytes.length);
        next.set(cur);
        next.set(bytes, cur.length);
        files.set(uri, next);
      },
      close() {},
    };
    return handle;
  }
}

export const Paths = {
  document: new Directory('file:///docs'),
  cache: new Directory('file:///cache'),
};

export const FileMode = { ReadOnly: 'r', WriteOnly: 'w', ReadWrite: 'rw' };
export const UploadType = { BINARY_CONTENT: 0, MULTIPART: 1 };
