export function createId(prefix = 'id'): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return `${prefix}_${cryptoObj.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function displayName(user: { firstName: string; lastName: string }): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export async function hashPassword(password: string): Promise<string> {
  const payload = `viora.local:${password}`;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.subtle) {
    const data = new TextEncoder().encode(payload);
    const digest = await cryptoObj.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (Math.imul(31, hash) + payload.charCodeAt(i)) | 0;
  }
  return `fallback_${hash}`;
}

export function paginate<T>(items: T[], page = 1, pageSize = 10) {
  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, pageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const current = Math.min(safePage, totalPages);
  const start = (current - 1) * safeSize;
  return {
    items: items.slice(start, start + safeSize),
    total,
    page: current,
    pageSize: safeSize,
    totalPages,
  };
}

export function matchesSearch(haystack: string, search?: string): boolean {
  if (!search?.trim()) return true;
  return haystack.toLowerCase().includes(search.trim().toLowerCase());
}
