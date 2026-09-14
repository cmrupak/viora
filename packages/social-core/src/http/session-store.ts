import type { SupportedStorage } from '../supabase';
import type { SessionUser } from '../types';

export type StoredAuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: 'bearer';
  user: SessionUser;
};

const MEMORY_KEY = 'viora.auth.session';

function memoryStorage(): SupportedStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    removeItem: async (key) => {
      map.delete(key);
    },
  };
}

function browserStorage(): SupportedStorage | null {
  if (typeof localStorage === 'undefined') return null;
  return {
    getItem: async (key) => localStorage.getItem(key),
    setItem: async (key, value) => {
      localStorage.setItem(key, value);
    },
    removeItem: async (key) => {
      localStorage.removeItem(key);
    },
  };
}

export type SessionStore = {
  get(): Promise<StoredAuthSession | null>;
  set(session: StoredAuthSession | null): Promise<void>;
  getAccessToken(): Promise<string | null>;
  subscribe(listener: (session: StoredAuthSession | null) => void): () => void;
};

export function createSessionStore(storage?: SupportedStorage): SessionStore {
  const store = storage ?? browserStorage() ?? memoryStorage();
  const listeners = new Set<(session: StoredAuthSession | null) => void>();
  let cache: StoredAuthSession | null | undefined;

  async function read(): Promise<StoredAuthSession | null> {
    if (cache !== undefined) return cache;
    const raw = await store.getItem(MEMORY_KEY);
    if (!raw) {
      cache = null;
      return null;
    }
    try {
      cache = JSON.parse(raw) as StoredAuthSession;
      return cache;
    } catch {
      cache = null;
      return null;
    }
  }

  async function write(session: StoredAuthSession | null): Promise<void> {
    cache = session;
    if (!session) {
      await store.removeItem(MEMORY_KEY);
    } else {
      await store.setItem(MEMORY_KEY, JSON.stringify(session));
    }
    listeners.forEach((fn) => fn(session));
  }

  return {
    get: read,
    set: write,
    async getAccessToken() {
      const session = await read();
      return session?.access_token ?? null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
