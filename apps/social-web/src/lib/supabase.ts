export function readSupabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

/** Dual-mode: set VITE_API_BACKEND=php and VITE_API_BASE_URL for local Laragon. Default supabase. */
export function readBackendEnv() {
  const mode = String(import.meta.env.VITE_API_BACKEND ?? 'supabase').toLowerCase();
  return {
    mode: mode === 'php' ? ('php' as const) : ('supabase' as const),
    apiBaseUrl: String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, ''),
    ...readSupabaseEnv(),
  };
}
