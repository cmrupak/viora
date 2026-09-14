export { getVioraSupabase, createVioraSupabase } from '@viora/core';

export function readSupabaseEnv() {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
}

/** Dual-mode: EXPO_PUBLIC_API_BACKEND=php + EXPO_PUBLIC_API_BASE_URL. Default supabase. */
export function readBackendEnv() {
  const mode = String(process.env.EXPO_PUBLIC_API_BACKEND ?? 'supabase').toLowerCase();
  return {
    mode: mode === 'php' ? ('php' as const) : ('supabase' as const),
    apiBaseUrl: String(process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, ''),
    ...readSupabaseEnv(),
  };
}
