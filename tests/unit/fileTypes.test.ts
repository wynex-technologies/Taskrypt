import { looksLikeText, matchesSignature, sanitizeFilename, sanitizeFolderName, validateFile } from '@/features/documents/fileTypes';
import { newStorageKey } from '@/features/documents/vaultService';

const PDF = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 20, 0]);
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
const MB = 1024 * 1024;

describe('sanitizeFilename', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\Windows\\system32\\evil.pdf', 'evil.pdf'],
    ['/var/mobile/Containers/report.pdf', 'report.pdf'],
    ['  .hidden.txt  ', 'hidden.txt'],
    ['in<voice>:"2026"|?.pdf', 'invoice2026.pdf'],
    ['bad\u0000name\u0007.txt', 'badname.txt'],
    ['gnp.‮exe.pdf', 'gnp.exe.pdf'],
    ['..', 'Untitled'],
    ['', 'Untitled'],
    ['CON.txt', '_CON.txt'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('caps length but keeps the extension', () => {
    const out = sanitizeFilename(`${'a'.repeat(400)}.docx`);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('.docx')).toBe(true);
  });

  it('never returns a path separator', () => {
    for (const s of ['a/b', 'a\\b', '/', '\\\\server\\share\\x.pdf']) expect(sanitizeFilename(s)).not.toMatch(/[/\\]/);
    expect(sanitizeFolderName('Tax/2026')).toBe('2026');
  });
});

describe('magic-byte validation', () => {
  it('recognizes real signatures', () => {
    expect(matchesSignature(PDF, 'pdf')).toBe(true);
    expect(matchesSignature(PNG, 'png')).toBe(true);
    expect(matchesSignature(ZIP, 'zip')).toBe(true);
    expect(matchesSignature(OLE, 'ole')).toBe(true);
    expect(matchesSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'jpeg')).toBe(true);
  });

  it('accepts valid files and maps MIME from the extension allow-list', () => {
    expect(validateFile({ name: 'Passport.PDF', size: 2 * MB, head: PDF, maxBytes: 50 * MB })).toMatchObject({ mime: 'application/pdf', kind: 'pdf' });
    expect(validateFile({ name: 'budget.xlsx', size: 1000, head: ZIP, maxBytes: 50 * MB }).mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(validateFile({ name: 'old.doc', size: 1000, head: OLE, maxBytes: 50 * MB }).kind).toBe('word');
    expect(validateFile({ name: 'notes.csv', size: 20, head: new TextEncoder().encode('a,b\n1,2'), maxBytes: MB }).mime).toBe('text/csv');
  });

  it('rejects an executable renamed to .pdf', () => {
    expect(() => validateFile({ name: 'invoice.pdf', size: 5000, head: EXE, maxBytes: 50 * MB })).toThrow(expect.objectContaining({ code: 'file_type_not_allowed' }));
  });

  it('rejects a PNG pretending to be a Word document', () => {
    expect(() => validateFile({ name: 'cv.docx', size: 5000, head: PNG, maxBytes: 50 * MB })).toThrow(expect.objectContaining({ code: 'file_type_not_allowed' }));
  });

  it('rejects disallowed extensions and oversize files', () => {
    expect(() => validateFile({ name: 'run.exe', size: 10, head: EXE, maxBytes: MB })).toThrow(expect.objectContaining({ code: 'file_type_not_allowed' }));
    expect(() => validateFile({ name: 'noext', size: 10, head: PDF, maxBytes: MB })).toThrow(expect.objectContaining({ code: 'file_type_not_allowed' }));
    expect(() => validateFile({ name: 'big.pdf', size: 51 * MB, head: PDF, maxBytes: 50 * MB })).toThrow(expect.objectContaining({ code: 'file_too_large' }));
  });

  it('treats binary data as non-text', () => {
    expect(looksLikeText(new Uint8Array([72, 105, 0, 1]))).toBe(false);
    expect(looksLikeText(new TextEncoder().encode('Grüße, 日本語 ok\n'))).toBe(true);
    expect(() => validateFile({ name: 'x.txt', size: 4, head: new Uint8Array([0, 1, 2, 3]), maxBytes: MB })).toThrow();
  });
});

describe('storage object keys', () => {
  it('are owner-prefixed UUID paths independent of the filename', () => {
    const key = newStorageKey('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
    expect(key).toMatch(/^11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\/[0-9a-f-]{36}$/);
  });
});
