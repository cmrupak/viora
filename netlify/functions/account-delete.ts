import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type NetlifyEvent = {
  httpMethod: string;
  body: string | null;
  headers: Record<string, string | undefined>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function readEnv(name: string) {
  return (process.env[name] || '').trim();
}

function getAdminClient(): SupabaseClient {
  const url = readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Server is missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireUser(event: NetlifyEvent): Promise<{ admin: SupabaseClient; user: User }> {
  const auth =
    event.headers.authorization ||
    event.headers.Authorization ||
    event.headers.AUTHORIZATION ||
    '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Missing Authorization bearer token.');

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid or expired session.');
  return { admin, user: data.user };
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Permanently deletes the Auth user. Profile + social rows cascade via FKs.
 * Requires confirmationPhrase === "DELETE".
 */
export async function handler(event: NetlifyEvent) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, message: 'Method not allowed' });
  }

  try {
    const { admin, user } = await requireUser(event);
    const body = JSON.parse(event.body || '{}') as {
      requestId?: string;
      confirmationPhrase?: string;
    };

    if (body.confirmationPhrase !== 'DELETE') {
      throw new Error('Type DELETE to confirm permanent account deletion.');
    }
    if (!body.requestId) throw new Error('requestId is required.');

    const { data: request, error: reqError } = await admin
      .from('account_deletion_requests')
      .select('id, user_id, status')
      .eq('id', body.requestId)
      .maybeSingle();

    if (reqError) throw new Error(reqError.message);
    if (!request || request.user_id !== user.id) {
      throw new Error('Deletion request not found.');
    }

    await admin
      .from('account_deletion_requests')
      .update({ status: 'processing', error_message: null })
      .eq('id', body.requestId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      await admin
        .from('account_deletion_requests')
        .update({ status: 'failed', error_message: deleteError.message })
        .eq('id', body.requestId);
      throw new Error(deleteError.message);
    }

    // Best-effort: row may already be gone via cascade
    await admin
      .from('account_deletion_requests')
      .update({ status: 'completed', error_message: null })
      .eq('id', body.requestId);

    return json(200, { ok: true, message: 'Account deleted.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete account.';
    return json(400, { ok: false, message });
  }
}
