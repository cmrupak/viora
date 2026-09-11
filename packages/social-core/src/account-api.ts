/**
 * Client helpers for Netlify account export / hard-delete Functions.
 * Pass the user's access token (never service_role).
 */

export type AccountApiResult = {
  ok: boolean;
  message: string;
  downloadUrl?: string | null;
  downloadPath?: string | null;
};

function resolveAccountApiUrl(path: '/api/account-export' | '/api/account-delete'): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return path;
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
  return `${base.replace(/\/$/, '')}${path}`;
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
