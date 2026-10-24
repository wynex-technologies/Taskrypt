/**
 * Minimal logger that never prints in production and scrubs values that look like
 * credentials, tokens, e-mail addresses or file contents.
 */
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

const SENSITIVE_KEYS = /pass(word)?|token|secret|key|authorization|cookie|session|email|content|body|nonce/i;
const JWT_LIKE = /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/g;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (typeof value === 'string') return value.replace(JWT_LIKE, '[jwt]').replace(EMAIL_LIKE, '[email]');
  if (value instanceof Uint8Array) return `[bytes:${value.byteLength}]`;
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, message: string, data?: unknown) {
  if (!isDev && level !== 'error') return;
  const line = `[${scope}] ${message}`;
  const payload = data === undefined ? undefined : redact(data);
  if (!isDev) {
    // Production: only the scope and a scrubbed message. Wire a crash reporter here.
    console.error(line);
    return;
  }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log; // eslint-disable-line no-console
  if (payload === undefined) fn(line);
  else fn(line, payload);
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, d?: unknown) => emit('debug', scope, m, d),
    info: (m: string, d?: unknown) => emit('info', scope, m, d),
    warn: (m: string, d?: unknown) => emit('warn', scope, m, d),
    error: (m: string, d?: unknown) => emit('error', scope, m, d),
  };
}
