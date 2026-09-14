import type { SupportedStorage } from '../supabase';

export type VioraBackendMode = 'supabase' | 'php';

export type VioraPhpConfig = {
  backend: 'php';
  /** e.g. http://viora.test/backend/public */
  baseUrl: string;
  /** Persist access/refresh tokens (localStorage / AsyncStorage). */
  storage?: SupportedStorage;
};

export type VioraSupabaseBackendConfig = {
  backend?: 'supabase';
  url: string;
  anonKey: string;
  storage?: SupportedStorage;
  detectSessionInUrl?: boolean;
};

export type VioraBackendConfig = VioraPhpConfig | VioraSupabaseBackendConfig;

export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function isPhpBackend(config: VioraBackendConfig): config is VioraPhpConfig {
  return (config as VioraPhpConfig).backend === 'php';
}
