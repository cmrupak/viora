import { normalizeBaseUrl } from './config';
import type { SessionStore, StoredAuthSession } from './session-store';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type VioraHttpClient = {
  baseUrl: string;
  request<T = unknown>(
    method: HttpMethod,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | number | boolean | null | undefined>;
      auth?: boolean;
      headers?: Record<string, string>;
    },
  ): Promise<T>;
  get<T = unknown>(path: string, query?: Record<string, string | number | boolean | null | undefined>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown): Promise<T>;
  del<T = unknown>(path: string, body?: unknown): Promise<T>;
};

function buildQuery(query?: Record<string, string | number | boolean | null | undefined>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function createHttpClient(opts: {
  baseUrl: string;
  session: SessionStore;
}): VioraHttpClient {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  let refreshPromise: Promise<StoredAuthSession | null> | null = null;

  async function refreshSession(): Promise<StoredAuthSession | null> {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const current = await opts.session.get();
      if (!current?.refresh_token) {
        await opts.session.set(null);
        return null;
      }
      const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        await opts.session.set(null);
        return null;
      }
      const session = (payload.session ?? payload) as StoredAuthSession;
      if (!session?.access_token) {
        await opts.session.set(null);
        return null;
      }
      const next: StoredAuthSession = {
        access_token: session.access_token,
        refresh_token: session.refresh_token ?? current.refresh_token,
        expires_in: Number(session.expires_in ?? 3600),
        expires_at: session.expires_at,
        token_type: 'bearer',
        user: session.user ?? current.user,
      };
      await opts.session.set(next);
      return next;
    })().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  async function request<T>(
    method: HttpMethod,
    path: string,
    options: {
      body?: unknown;
      query?: Record<string, string | number | boolean | null | undefined>;
      auth?: boolean;
      headers?: Record<string, string>;
      _retried?: boolean;
    } = {},
  ): Promise<T> {
    const auth = options.auth !== false;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth) {
      const token = await opts.session.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${baseUrl}${path}${buildQuery(options.query)}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (res.status === 401 && auth && !options._retried) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return request<T>(method, path, { ...options, _retried: true });
      }
    }

    const text = await res.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    if (!res.ok) {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : `Request failed (${res.status})`;
      throw new Error(message);
    }

    return payload as T;
  }

  return {
    baseUrl,
    request,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body: body ?? {} }),
    patch: (path, body) => request('PATCH', path, { body: body ?? {} }),
    del: (path, body) => request('DELETE', path, { body }),
  };
}
