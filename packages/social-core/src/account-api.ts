/**
 * Account export / hard-delete helpers.
 * Netlify Functions (Supabase) or PHP `/api/v1/account-*` depending on env.
 * Pass the user's access token (never service_role).
 */

export type AccountApiResult = {
  ok: boolean;
  message: string;
  downloadUrl?: string | null;
  downloadPath?: string | null;
};

function phpBaseUrl(): string | null {
  if (typeof process === 'undefined') return null;
  const mode = String(process.env.EXPO_PUBLIC_API_BACKEND ?? process.env.VITE_API_BACKEND ?? '').toLowerCase();
  if (mode !== 'php') return null;
  const base = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL || '';
  return base ? base.replace(/\/$/, '') : null;
}

function resolveAccountApiUrl(
  path: '/api/account-export' | '/api/account-delete' | '/api/v1/account-export' | '/api/v1/account-delete',
): string {
  const php = phpBaseUrl();
  if (php) {
    const v1 =
      path === '/api/account-export'
        ? '/api/v1/account-export'
        : path === '/api/account-delete'
          ? '/api/v1/account-delete'
          : path;
    return `${php}${v1}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return path.startsWith('/api/v1/') ? path.replace('/api/v1/', '/api/') : path;
  }
  const base =
    (typeof process !== 'undefined' &&
      (process.env.EXPO_PUBLIC_WEB_API_URL ||
        process.env.EXPO_PUBLIC_API_URL ||
        process.env.VITE_APP_ORIGIN)) ||
    '';
  if (!base) {
    throw new Error(
      'Set EXPO_PUBLIC_WEB_API_URL to your web origin (e.g. https://vioradev.netlify.app) for account export/delete on mobile.',
    );
  }
  const netlifyPath = path.startsWith('/api/v1/') ? path.replace('/api/v1/', '/api/') : path;
  return `${base.replace(/\/$/, '')}${netlifyPath}`;
}

async function postAccountApi(
  path: '/api/account-export' | '/api/account-delete',
  accessToken: string,
  body: Record<string, unknown>,
): Promise<AccountApiResult> {
  const response = await fetch(resolveAccountApiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as AccountApiResult;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || 'Account request failed.');
  }
  return payload;
}

export function runAccountExport(accessToken: string, requestId: string) {
  return postAccountApi('/api/account-export', accessToken, { requestId });
}

export function runAccountHardDelete(
  accessToken: string,
  requestId: string,
  confirmationPhrase: string,
) {
  return postAccountApi('/api/account-delete', accessToken, {
    requestId,
    confirmationPhrase,
  });
}
