import { AppError } from '@/lib/errors';

/**
 * Allow-list of document types. The client-supplied extension and MIME type are
 * only hints: the file's leading bytes ("magic numbers") must agree with the
 * extension before an upload is accepted. The bucket and the documents table
 * enforce the same MIME allow-list server-side.
 */

export type FileKind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'text' | 'csv' | 'image' | 'rtf' | 'archive';

type TypeSpec = { mime: string; kind: FileKind; signature: Signature; label: string };
type Signature = 'pdf' | 'png' | 'jpeg' | 'zip' | 'ole' | 'text' | 'rtf' | 'heic' | 'webp';

export const FILE_TYPES: Record<string, TypeSpec> = {
  pdf: { mime: 'application/pdf', kind: 'pdf', signature: 'pdf', label: 'PDF' },
  doc: { mime: 'application/msword', kind: 'word', signature: 'ole', label: 'Word' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'word', signature: 'zip', label: 'Word' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'excel', signature: 'ole', label: 'Excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'excel', signature: 'zip', label: 'Excel' },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'powerpoint', signature: 'ole', label: 'PowerPoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'powerpoint', signature: 'zip', label: 'PowerPoint' },
  txt: { mime: 'text/plain', kind: 'text', signature: 'text', label: 'Text' },
  md: { mime: 'text/plain', kind: 'text', signature: 'text', label: 'Text' },
  csv: { mime: 'text/csv', kind: 'csv', signature: 'text', label: 'CSV' },
  jpg: { mime: 'image/jpeg', kind: 'image', signature: 'jpeg', label: 'JPEG' },
  jpeg: { mime: 'image/jpeg', kind: 'image', signature: 'jpeg', label: 'JPEG' },
  png: { mime: 'image/png', kind: 'image', signature: 'png', label: 'PNG' },
  heic: { mime: 'image/heic', kind: 'image', signature: 'heic', label: 'HEIC' },
  webp: { mime: 'image/webp', kind: 'image', signature: 'webp', label: 'WebP' },
  rtf: { mime: 'application/rtf', kind: 'rtf', signature: 'rtf', label: 'RTF' },
  zip: { mime: 'application/zip', kind: 'archive', signature: 'zip', label: 'ZIP' },
};

export const ALLOWED_MIME_TYPES = [...new Set(Object.values(FILE_TYPES).map((t) => t.mime))];

/** MIME types accepted by the system document picker. */
export const PICKER_MIME_TYPES = ALLOWED_MIME_TYPES;

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i + 1).toLowerCase() : '';
}

export function kindOfMime(mime: string): FileKind | null {
  return Object.values(FILE_TYPES).find((t) => t.mime === mime)?.kind ?? null;
}

export function labelOfMime(mime: string): string {
  return Object.values(FILE_TYPES).find((t) => t.mime === mime)?.label ?? 'File';
}

const RESERVED = /[<>:"/\\|?*\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Turn any user/OS supplied filename into a safe DISPLAY name. Path separators
 * are removed (so "../../etc/passwd" becomes "passwd"), control and bidi-override
 * characters are stripped, and length is capped while keeping the extension.
 * Storage object keys never use this value — they are random UUIDs.
 */
export function sanitizeFilename(input: string, fallback = 'Untitled'): string {
  let name = (input ?? '').normalize('NFC');
  name = name.split(/[/\\]/).pop() ?? '';
  name = name.replace(RESERVED, '').replace(/\s+/g, ' ').trim();
  name = name.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (!name || name === '.' || name === '..') name = fallback;
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`;
  if (name.length > 200) {
    const ext = extensionOf(name);
    const base = ext ? name.slice(0, -(ext.length + 1)) : name;
    name = ext && ext.length <= 10 ? `${base.slice(0, 200 - ext.length - 1)}.${ext}` : name.slice(0, 200);
  }
  return name;
}

/** Folder names follow the same rules, without the extension handling. */
export function sanitizeFolderName(input: string): string {
  return sanitizeFilename(input, 'New folder').slice(0, 80);
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

export function matchesSignature(head: Uint8Array, signature: Signature): boolean {
  switch (signature) {
    case 'pdf':
      return startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case 'png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'zip':
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06]);
    case 'ole':
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'rtf':
      return ascii(head, 0, 5) === '{\\rtf';
    case 'webp':
      return ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP';
    case 'heic': {
      if (ascii(head, 4, 8) !== 'ftyp') return false;
      return ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(ascii(head, 8, 12));
    }
    case 'text':
      return looksLikeText(head);
  }
}

/** Heuristic: no NUL bytes and mostly printable / valid UTF-8 continuation. */
export function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return true;
  let control = 0;
  for (const b of head) {
    if (b === 0) return false;
    if (b < 0x09 || (b > 0x0d && b < 0x20)) control++;
  }
  return control / head.length < 0.02;
}

export type ValidatedFile = { name: string; mime: string; kind: FileKind; extension: string };

export function validateFile(params: { name: string; size: number; head: Uint8Array; maxBytes: number }): ValidatedFile {
  const name = sanitizeFilename(params.name);
  const ext = extensionOf(name);
  const spec = FILE_TYPES[ext];
  if (!spec) throw new AppError('file_type_not_allowed', { userMessage: `.${ext || '?'} files are not supported.` });
  if (!Number.isFinite(params.size) || params.size < 0) throw new AppError('file_corrupted');
  if (params.size > params.maxBytes)
    throw new AppError('file_too_large', { userMessage: `Files can be up to ${Math.round(params.maxBytes / 1048576)} MB.` });
  if (params.size > 0 && !matchesSignature(params.head, spec.signature))
    throw new AppError('file_type_not_allowed', {
      userMessage: `This file does not look like a real ${spec.label} file, so it was not uploaded.`,
    });
  return { name, mime: spec.mime, kind: spec.kind, extension: ext };
}
