import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';

import { secureSessionStorage } from './secureSessionStorage';

/**
 * The ONLY Supabase client. It is created with the public anon/publishable key;
 * all authorization is enforced server-side by RLS and storage policies.
 * The service-role key must never appear anywhere in this codebase.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!env.isBackendConfigured) throw new AppError('not_configured');
  client = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: {
      storage: secureSessionStorage,
      storageKey: 'taskora-auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-client-info': `taskrypt-mobile/${Platform.OS}` },
    },
  });

  // Refresh tokens only while foregrounded (Supabase guidance for React Native).
  AppState.addEventListener('change', (state) => {
    if (!client) return;
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return client;
}

export function isSupabaseConfigured() {
  return env.isBackendConfigured;
}
