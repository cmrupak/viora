import type { Session, SupabaseClient, SupportedStorage } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

export type VioraSupabaseConfig = {
  url: string;
  anonKey: string;
  /** Pass AsyncStorage on React Native for session persistence. */
  storage?: SupportedStorage;
  detectSessionInUrl?: boolean;
};

let client: SupabaseClient | null = null;

/**
 * Browser / React Native client only.
 * Never put the service-role key in web or mobile.
 */
export function createVioraSupabase(config: VioraSupabaseConfig): SupabaseClient {
  if (!config.url || !config.anonKey) {
    throw new Error('Missing Supabase URL or anon key. Set EXPO_PUBLIC_/VITE_ env vars.');
  }
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: config.detectSessionInUrl ?? true,
      storage: config.storage,
      flowType: 'pkce',
    },
  });
}

export function getVioraSupabase(config: VioraSupabaseConfig): SupabaseClient {
  if (!client) {
    client = createVioraSupabase(config);
  }
  return client;
}

export function resetVioraSupabase(): void {
  client = null;
}

export type { Session, SupportedStorage };
