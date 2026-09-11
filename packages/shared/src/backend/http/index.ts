import { AppError, ERROR_CODES, type ErrorCode } from '../../errors';
import type {
  IdentifyInput,
  IdentifyResult,
  ListQuery,
  LoginInput,
  PaginatedResult,
  ProfileSetupInput,
  ProfileUpdateInput,
  RecordInput,
  RecordItem,
  RegisterInput,
  UserProfile,
  UserRole,
} from '../../types';
import type { KeyValueStorage } from '../../storage';
import type { VioraBackend } from '../types';

const TOKEN_KEY = 'viora.api.token';
const USER_CACHE_KEY = 'viora.api.user.cache';

type ApiErrorBody = {
  code?: ErrorCode;
  message?: string;
  fieldErrors?: Record<string, string>;
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAuthFailure(code?: ErrorCode, status?: number): boolean {
  if (status === 401 || status === 403) return true;
  return (
    code === ERROR_CODES.UNAUTHENTICATED ||
    code === ERROR_CODES.FORBIDDEN ||
    code === ERROR_CODES.ACCOUNT_INACTIVE ||
    code === ERROR_CODES.INVALID_CREDENTIAL
  );
}

export function createHttpBackend(options: {
  baseUrl: string;
  storage: KeyValueStorage;
}): VioraBackend {
  const { baseUrl, storage } = options;

  async function request<T>(
    path: string,
    init: RequestInit = {},
    auth = true,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (auth) {
      const token = await storage.getItem(TOKEN_KEY);
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    const method = (init.method ?? 'GET').toUpperCase();
    const isSafeRetryPath =
      path.includes('/auth/me') ||
      path.includes('/auth/identify') ||
      path.includes('/auth/login') ||
      path.includes('/stats/') ||
      path.includes('/health') ||
      path.includes('/records/mine') ||
      path.includes('/records/all') ||
      path.includes('/admin/users');
    const canRetry =
      method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || isSafeRetryPath;

    let lastError: AppError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'network error';
        lastError = new AppError(
          ERROR_CODES.NETWORK,
          `Cannot reach API (${detail}). Retrying…`,
        );
        if (attempt < MAX_ATTEMPTS && canRetry) {
          await sleep(400 * attempt * attempt);
          continue;
        }
        throw new AppError(
          ERROR_CODES.NETWORK,
          `Cannot reach API at ${baseUrl}${path}. Check your internet and try again.`,
        );
      }

      const raw = await response.text();
      let data = {} as T & ApiErrorBody;
      if (raw) {
        try {
          data = JSON.parse(raw) as T & ApiErrorBody;
        } catch {
          lastError = new AppError(
            ERROR_CODES.NETWORK,
            `API temporarily unavailable (${response.status}).`,
          );
          if (attempt < MAX_ATTEMPTS && RETRYABLE_STATUS.has(response.status)) {
            await sleep(400 * attempt * attempt);
            continue;
          }
          throw lastError;
        }
      }

      if (!response.ok) {
        const code = (data.code as ErrorCode) ?? ERROR_CODES.UNKNOWN;
        const message = data.message ?? `Request failed (${response.status}).`;
        lastError = new AppError(code, message, data.fieldErrors);

        if (
          attempt < MAX_ATTEMPTS &&
          canRetry &&
          RETRYABLE_STATUS.has(response.status) &&
          !isAuthFailure(code, response.status)
        ) {
          await sleep(400 * attempt * attempt);
          continue;
        }
        throw lastError;
      }

      return data;
    }

    throw lastError ?? new AppError(ERROR_CODES.UNKNOWN, 'Request failed.');
  }

  function queryString(query?: ListQuery): string {
    if (!query) return '';
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.status) params.set('status', String(query.status));
    if (query.role) params.set('role', String(query.role));
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortDir) params.set('sortDir', query.sortDir);
    const value = params.toString();
    return value ? `?${value}` : '';
  }

  async function cacheUser(user: UserProfile | null): Promise<void> {
    if (!user) {
      await storage.removeItem(USER_CACHE_KEY);
      return;
    }
    await storage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  }

  async function readCachedUser(): Promise<UserProfile | null> {
    const raw = await storage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserProfile;
    } catch {
      return null;
    }
  }

  return {
    kind: 'api',
    auth: {
      async identify(input: IdentifyInput) {
        const result = await request<IdentifyResult>(
          '/auth/identify',
          { method: 'POST', body: JSON.stringify(input) },
          false,
        );
        if (result.status === 'authenticated') {
          await storage.setItem(TOKEN_KEY, result.token);
          await cacheUser(result.user);
        }
        return result;
      },
      async loginByUid(uid: string) {
        const result = await request<{ token: string; user: UserProfile }>(
          '/auth/login-uid',
          { method: 'POST', body: JSON.stringify({ uid }) },
          false,
        );
        await storage.setItem(TOKEN_KEY, result.token);
        await cacheUser(result.user);
        return result.user;
      },
      async register(input: RegisterInput) {
        const result = await request<{ token: string; user: UserProfile }>(
          '/auth/register',
          { method: 'POST', body: JSON.stringify(input) },
          false,
        );
        await storage.setItem(TOKEN_KEY, result.token);
        await cacheUser(result.user);
        return result.user;
      },
      async setupProfile(input: ProfileSetupInput) {
        const result = await request<{ user: UserProfile }>('/auth/setup-profile', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        await cacheUser(result.user);
        return result.user;
      },
      async login(input: LoginInput) {
        const result = await request<{ token: string; user: UserProfile }>(
          '/auth/login',
          { method: 'POST', body: JSON.stringify(input) },
          false,
        );
        await storage.setItem(TOKEN_KEY, result.token);
        await cacheUser(result.user);
        return result.user;
      },
      async logout() {
        try {
          await request('/auth/logout', { method: 'POST' });
        } finally {
          await storage.removeItem(TOKEN_KEY);
          await cacheUser(null);
        }
      },
      async resetPassword(email: string) {
        await request('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        }, false);
      },
      async confirmPasswordReset(email: string, password: string) {
        await request(
          '/auth/confirm-password-reset',
          { method: 'POST', body: JSON.stringify({ email, password }) },
          false,
        );
      },
      async getCurrentUser() {
        const token = await storage.getItem(TOKEN_KEY);
        if (!token) {
          await cacheUser(null);
          return null;
        }
        try {
          const result = await request<{ user: UserProfile }>('/auth/me');
          await cacheUser(result.user);
          return result.user;
        } catch (error) {
          if (error instanceof AppError && error.code === ERROR_CODES.ACCOUNT_INACTIVE) {
            await storage.removeItem(TOKEN_KEY);
            await cacheUser(null);
            throw error;
          }
          if (error instanceof AppError && isAuthFailure(error.code)) {
            await storage.removeItem(TOKEN_KEY);
            await cacheUser(null);
            return null;
          }
          // Transient network / cold-start: keep session, return cache if any
          const cached = await readCachedUser();
          if (cached) return cached;
          throw error;
        }
      },
      async refreshUser() {
        return this.getCurrentUser();
      },
    },
    users: {
      async getById(uid: string) {
        const result = await request<{ user: UserProfile }>(`/users/${uid}`);
        return result.user;
      },
      async updateProfile(uid: string, input: ProfileUpdateInput) {
        const result = await request<{ user: UserProfile }>(`/users/${uid}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
        await cacheUser(result.user);
        return result.user;
      },
      async deactivateSelf() {
        await request('/users/me/deactivate', { method: 'POST' });
        await storage.removeItem(TOKEN_KEY);
        await cacheUser(null);
      },
    },
    records: {
      async create(input: RecordInput) {
        const result = await request<{ record: RecordItem }>('/records', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return result.record;
      },
      async getById(id: string) {
        const result = await request<{ record: RecordItem }>(`/records/${id}`);
        return result.record;
      },
      async listMine(query?: ListQuery) {
        return request<PaginatedResult<RecordItem>>(`/records/mine${queryString(query)}`);
      },
      async listAll(query?: ListQuery) {
        return request<PaginatedResult<RecordItem>>(`/records/all${queryString(query)}`);
      },
      async update(id: string, input: RecordInput) {
        const result = await request<{ record: RecordItem }>(`/records/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
        return result.record;
      },
      async softDelete(id: string) {
        await request(`/records/${id}`, { method: 'DELETE' });
      },
    },
    admin: {
      async listUsers(query?: ListQuery) {
        return request<PaginatedResult<UserProfile>>(`/admin/users${queryString(query)}`);
      },
      async getUser(uid: string) {
        const result = await request<{ user: UserProfile }>(`/admin/users/${uid}`);
        return result.user;
      },
      async updateUser(uid: string, input: ProfileUpdateInput & { role?: UserRole }) {
        const result = await request<{ user: UserProfile }>(`/admin/users/${uid}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        });
        return result.user;
      },
      async activateUser(uid: string) {
        const result = await request<{ user: UserProfile }>(`/admin/users/${uid}/activate`, {
          method: 'POST',
        });
        return result.user;
      },
      async deactivateUser(uid: string) {
        const result = await request<{ user: UserProfile }>(`/admin/users/${uid}/deactivate`, {
          method: 'POST',
        });
        return result.user;
      },
      async changeRole(uid: string, role: UserRole) {
        const result = await request<{ user: UserProfile }>(`/admin/users/${uid}/role`, {
          method: 'POST',
          body: JSON.stringify({ role }),
        });
        return result.user;
      },
    },
    files: {
      async uploadProfileImage(file: Blob, _fileName: string, contentType: string) {
        const photoURL = await blobToDataUrl(file);
        if (!contentType.startsWith('image/')) {
          throw new AppError(ERROR_CODES.VALIDATION, 'Use a JPEG, PNG, or WebP image.');
        }
        const result = await request<{ photoURL: string }>('/users/me/photo', {
          method: 'POST',
          body: JSON.stringify({ photoURL }),
        });
        return result.photoURL;
      },
    },
    stats: {
      async getDashboardStats() {
        const result = await request<{ stats: Awaited<ReturnType<VioraBackend['stats']['getDashboardStats']>> }>(
          '/stats/dashboard',
        );
        return result.stats;
      },
    },
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AppError(ERROR_CODES.UNKNOWN, 'Unable to read the selected file.'));
    reader.readAsDataURL(blob);
  });
}
