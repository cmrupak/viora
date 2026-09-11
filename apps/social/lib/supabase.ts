export { getVioraSupabase, createVioraSupabase } from '@viora/core';

export function readSupabaseEnv() {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
}
