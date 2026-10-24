import { z } from 'zod';

/**
 * Public, build-time configuration. EXPO_PUBLIC_* values are inlined into the JS
 * bundle by Metro, so nothing secret may ever be read here.
 */
const schema = z.object({
  supabaseUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(20).optional(),
  documentBucket: z.string().regex(/^[a-z0-9-]{3,63}$/).default('vault'),
  maxUploadMb: z.coerce.number().int().min(1).max(500).default(50),
  offlineGraceDays: z.coerce.number().int().min(0).max(90).default(14),
  authRedirectUrl: z.string().default('taskrypt://auth/callback'),
  appEnv: z.enum(['development', 'staging', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || undefined,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined,
  documentBucket: process.env.EXPO_PUBLIC_DOCUMENT_BUCKET || undefined,
  maxUploadMb: process.env.EXPO_PUBLIC_MAX_UPLOAD_MB || undefined,
  offlineGraceDays: process.env.EXPO_PUBLIC_OFFLINE_GRACE_DAYS || undefined,
  authRedirectUrl: process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || undefined,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV || (process.env.NODE_ENV === 'test' ? 'test' : undefined),
});

if (!parsed.success) {
  // Fail loudly in development; a misconfigured production build must never boot silently.
  throw new Error(`Invalid Taskrypt environment configuration: ${parsed.error.message}`);
}

export const env = {
  ...parsed.data,
  maxUploadBytes: parsed.data.maxUploadMb * 1024 * 1024,
  isProduction: parsed.data.appEnv === 'production',
  /** True when Supabase credentials are present. The UI shows a setup screen otherwise. */
  isBackendConfigured: Boolean(parsed.data.supabaseUrl && parsed.data.supabaseAnonKey),
} as const;
