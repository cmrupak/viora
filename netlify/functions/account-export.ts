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

export async function handler(event: NetlifyEvent) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, message: 'Method not allowed' });
  }

  try {
    const { admin, user } = await requireUser(event);
    const body = JSON.parse(event.body || '{}') as { requestId?: string };
    if (!body.requestId) throw new Error('requestId is required.');

    const { data: request, error: reqError } = await admin
      .from('data_export_requests')
      .select('id, user_id, status')
      .eq('id', body.requestId)
      .maybeSingle();

    if (reqError) throw new Error(reqError.message);
    if (!request || request.user_id !== user.id) throw new Error('Export request not found.');

    await admin
      .from('data_export_requests')
      .update({ status: 'processing', error_message: null })
      .eq('id', body.requestId);

    const [profile, posts, comments, follows, reports, settings, loginEvents] = await Promise.all([
      admin.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      admin.from('posts').select('id, body, visibility, created_at, deleted_at').eq('author_id', user.id),
      admin.from('comments').select('id, post_id, body, created_at, deleted_at').eq('author_id', user.id),
      admin.from('follows').select('follower_id, following_id, created_at').or(`follower_id.eq.${user.id},following_id.eq.${user.id}`),
      admin.from('reports').select('id, target_type, target_id, reason, status, created_at').eq('reporter_id', user.id),
      admin.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
      admin.from('login_events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      profile: profile.data,
      settings: settings.data,
      posts: posts.data ?? [],
      comments: comments.data ?? [],
      follows: follows.data ?? [],
      reports: reports.data ?? [],
      loginEvents: loginEvents.data ?? [],
    };

    const path = `${user.id}/${body.requestId}.json`;
    const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
    const { error: uploadError } = await admin.storage
      .from('account-exports')
      .upload(path, bytes, { contentType: 'application/json', upsert: true });

    if (uploadError) {
      await admin
        .from('data_export_requests')
        .update({ status: 'failed', error_message: uploadError.message })
        .eq('id', body.requestId);
      throw new Error(uploadError.message);
    }

    await admin
      .from('data_export_requests')
      .update({ status: 'ready', download_path: path, error_message: null })
      .eq('id', body.requestId);

    const { data: signed } = await admin.storage
      .from('account-exports')
      .createSignedUrl(path, 60 * 60);

    return json(200, {
      ok: true,
      message: 'Export ready.',
      downloadPath: path,
      downloadUrl: signed?.signedUrl ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to export data.';
    return json(400, { ok: false, message });
  }
}
