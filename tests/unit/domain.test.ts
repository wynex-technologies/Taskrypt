import { parseCsv } from '@/features/documents/csv';
import { describeRecurrence, nextOccurrence, occurrenceId } from '@/features/tasks/recurrence';
import { streakOf } from '@/features/tasks/streak';
import { base64ToBytes, bytesToBase64, formatBytes } from '@/lib/bytes';
import { AppError, toAppError } from '@/lib/errors';
import { isUuid, uuid, uuidV5 } from '@/lib/ids';
import { redact } from '@/lib/logger';
import { backoffMs } from '@/repositories/syncQueueRepository';

describe('ids', () => {
  it('v4 ids are valid and unique', () => {
    const ids = new Set(Array.from({ length: 500 }, uuid));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(isUuid(id)).toBe(true);
  });

  it('v5 matches the RFC 4122 reference vector', () => {
    // uuid v5("www.example.com", DNS namespace)
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('occurrence ids are deterministic per series and due date', () => {
    const t = { id: 'a1b2c3d4-0000-4000-8000-000000000001', recurrence_parent_id: null };
    const child = { id: 'ffffffff-0000-4000-8000-000000000009', recurrence_parent_id: t.id };
    const due = '2026-10-25T09:00:00.000Z';
    expect(occurrenceId(t, due)).toBe(occurrenceId(t, due));
    expect(occurrenceId(child, due)).toBe(occurrenceId(t, due));
    expect(occurrenceId(t, '2026-10-26T09:00:00.000Z')).not.toBe(occurrenceId(t, due));
  });
});

describe('recurrence', () => {
  const base = new Date(2026, 9, 24, 9, 30); // Saturday 24 Oct 2026, 09:30

  it('daily / every N days', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, base)?.getDate()).toBe(25);
    expect(nextOccurrence({ freq: 'daily', interval: 3 }, base)?.getDate()).toBe(27);
  });

  it('weekly on chosen weekdays keeps the time of day', () => {
    const next = nextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1, 3] }, base)!; // Mon, Wed
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(26);
    expect(next.getHours()).toBe(9);
    expect(nextOccurrence({ freq: 'weekly', interval: 1, weekdays: [1, 3] }, next)!.getDay()).toBe(3);
  });

  it('monthly clamps to the last day of shorter months', () => {
    const jan31 = new Date(2026, 0, 31, 8);
    const feb = nextOccurrence({ freq: 'monthly', interval: 1 }, jan31)!;
    expect(feb.getMonth()).toBe(1);
    expect(feb.getDate()).toBe(28);
  });

  it('custom units and until', () => {
    expect(nextOccurrence({ freq: 'custom', interval: 2, unit: 'week' }, base)?.getDate()).toBe(7);
    expect(nextOccurrence({ freq: 'daily', interval: 1, until: new Date(2026, 9, 24, 23).toISOString() }, base)).toBeNull();
  });

  it('describes rules for humans', () => {
    expect(describeRecurrence(null)).toBe('Does not repeat');
    expect(describeRecurrence({ freq: 'weekly', interval: 2, weekdays: [1, 5] })).toBe('Every 2 weeks on Mon, Fri');
  });
});

describe('helpers', () => {
  it('base64 round-trips binary', () => {
    for (const n of [0, 1, 2, 3, 31, 256]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37) & 255);
      expect(Array.from(base64ToBytes(bytesToBase64(b)))).toEqual(Array.from(b));
      expect(bytesToBase64(b)).toBe(Buffer.from(b).toString('base64'));
    }
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50.0 MB');
  });

  it('parses quoted CSV', () => {
    expect(parseCsv('name,note\r\n"Smith, J","said ""hi"""\n3,4')).toEqual([
      ['name', 'note'],
      ['Smith, J', 'said "hi"'],
      ['3', '4'],
    ]);
  });

  it('computes streaks', () => {
    expect(streakOf([{ count: 1 }, { count: 2 }, { count: 0 }])).toBe(2);
    expect(streakOf([{ count: 0 }, { count: 1 }, { count: 3 }])).toBe(2);
    expect(streakOf([{ count: 1 }, { count: 0 }, { count: 0 }])).toBe(0);
  });

  it('backs off exponentially with a cap', () => {
    const fixed = () => 0.5;
    expect(backoffMs(1, fixed)).toBe(2000);
    expect(backoffMs(3, fixed)).toBe(8000);
    expect(backoffMs(30, fixed)).toBe(600_000);
  });
});

describe('error mapping', () => {
  it.each([
    [{ message: 'Network request failed' }, 'network'],
    [{ name: 'AuthRetryableFetchError', message: 'x' }, 'network'],
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'invalid_credentials'],
    [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'email_not_verified'],
    [{ status: 429, message: 'too many' }, 'rate_limited'],
    [{ status: 401, message: 'JWT expired' }, 'session_expired'],
    [{ code: '42501', message: 'new row violates row-level security policy' }, 'permission_denied'],
    [{ message: 'storage quota exceeded' }, 'storage_quota'],
    [{ status: 413, message: 'Payload too large' }, 'file_too_large'],
  ])('%j → %s', (input, code) => {
    expect(toAppError(input).code).toBe(code);
  });

  it('keeps AppError instances and gives user-safe messages', () => {
    const e = new AppError('offline');
    expect(toAppError(e)).toBe(e);
    expect(toAppError(new Error('pg internal detail: relation x')).userMessage).not.toContain('relation');
  });
});

describe('log redaction', () => {
  it('scrubs tokens, e-mails and secret-looking keys', () => {
    const out = JSON.stringify(
      redact({
        access_token: 'abc',
        user: { email: 'a@b.co', name: 'Ann' },
        msg: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U for x@y.io',
        bytes: new Uint8Array(10),
      }),
    );
    expect(out).not.toContain('abc');
    expect(out).not.toContain('a@b.co');
    expect(out).not.toContain('x@y.io');
    expect(out).not.toContain('eyJhbGci');
    expect(out).toContain('Ann');
  });
});
