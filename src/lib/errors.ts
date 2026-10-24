/**
 * Centralized error model. Every service throws or returns AppError so screens
 * can render a consistent, human message without leaking internals.
 */
export type AppErrorCode =
  | 'network'
  | 'offline'
  | 'unauthorized'
  | 'session_expired'
  | 'email_not_verified'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'permission_denied'
  | 'file_too_large'
  | 'file_type_not_allowed'
  | 'file_corrupted'
  | 'storage_quota'
  | 'crypto'
  | 'cancelled'
  | 'not_configured'
  | 'unknown';

const MESSAGES: Record<AppErrorCode, string> = {
  network: 'We could not reach the server. Check your connection and try again.',
  offline: 'You are offline. This action needs an internet connection.',
  unauthorized: 'Please sign in to continue.',
  session_expired: 'Your session has expired. Please sign in again.',
  email_not_verified: 'Please verify your e-mail address before signing in.',
  invalid_credentials: 'That e-mail and password combination did not match.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  validation: 'Some details need your attention.',
  not_found: 'We could not find that item. It may have been deleted.',
  conflict: 'This item changed on another device. The newest version was kept.',
  permission_denied: 'You do not have permission to do that.',
  file_too_large: 'That file is larger than the allowed upload size.',
  file_type_not_allowed: 'That file type is not supported.',
  file_corrupted: 'The file could not be verified and may be damaged.',
  storage_quota: 'Your vault is full. Remove some files to free space.',
  crypto: 'This file could not be decrypted on this device.',
  cancelled: 'Cancelled.',
  not_configured: 'Taskrypt is not connected to a backend yet. See the README to configure Supabase.',
  unknown: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    options: { message?: string; userMessage?: string; cause?: unknown; retryable?: boolean } = {},
  ) {
    super(options.message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = options.userMessage ?? MESSAGES[code];
    this.cause = options.cause;
    this.retryable = options.retryable ?? (code === 'network' || code === 'offline' || code === 'rate_limited');
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

type MaybeSupabaseError = { message?: string; status?: number; code?: string; name?: string };

/** Map unknown failures (fetch, Supabase, PostgREST, storage, native) to AppError. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  const err = (e ?? {}) as MaybeSupabaseError;
  const message = typeof err.message === 'string' ? err.message : String(e);
  const lower = message.toLowerCase();
  const status = typeof err.status === 'number' ? err.status : undefined;
  const code = typeof err.code === 'string' ? err.code : undefined;

  if (err.name === 'AbortError' || lower.includes('aborted') || lower.includes('cancelled'))
    return new AppError('cancelled', { cause: e });
  if (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('timeout') ||
    lower.includes('network error') ||
    err.name === 'AuthRetryableFetchError'
  )
    return new AppError('network', { cause: e, message });
  if (code === 'invalid_credentials' || lower.includes('invalid login credentials'))
    return new AppError('invalid_credentials', { cause: e });
  if (code === 'email_not_confirmed' || lower.includes('email not confirmed'))
    return new AppError('email_not_verified', { cause: e });
  if (
    status === 429 ||
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    lower.includes('rate limit')
  )
    return new AppError('rate_limited', { cause: e });
  if (code === 'otp_expired' || lower.includes('token has expired') || lower.includes('otp'))
    return new AppError('validation', { cause: e, userMessage: 'That code is invalid or has expired. Request a new one.' });
  if (status === 401 || code === 'PGRST301' || lower.includes('jwt expired'))
    return new AppError('session_expired', { cause: e });
  if (status === 403 || code === '42501' || lower.includes('row-level security'))
    return new AppError('permission_denied', { cause: e });
  if (lower.includes('bucket not found'))
    return new AppError('not_configured', { cause: e, userMessage: 'The "vault" storage bucket is missing on the server. Re-run the Supabase migration.' });
  if (lower.includes('storage quota')) return new AppError('storage_quota', { cause: e });
  if (status === 404) return new AppError('not_found', { cause: e });
  if (status === 413 || lower.includes('maximum allowed size') || lower.includes('payload too large'))
    return new AppError('file_too_large', { cause: e });
  if (lower.includes('mime type') || lower.includes('invalid_mime_type'))
    return new AppError('file_type_not_allowed', { cause: e });
  if (code === 'weak_password')
    return new AppError('validation', { cause: e, userMessage: 'Please choose a stronger password.' });
  if (code === 'user_already_exists' || lower.includes('already registered'))
    return new AppError('validation', {
      cause: e,
      userMessage: 'An account with this e-mail already exists. Try signing in.',
    });
  // In development, surface the underlying cause so failures on a device are diagnosable.
  const devDetail = process.env.EXPO_PUBLIC_APP_ENV === 'development' && message && message !== 'unknown' ? ` (${message.slice(0, 160)})` : '';
  return new AppError('unknown', { cause: e, message, userMessage: devDetail ? MESSAGES.unknown + devDetail : undefined });
}

export function userMessageOf(e: unknown): string {
  return toAppError(e).userMessage;
}
