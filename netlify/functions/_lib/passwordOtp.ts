import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export type PasswordOtpRequest = {
  action: 'send' | 'reset';
  email?: string;
  otp?: string;
  password?: string;
};

export type PasswordOtpResponse = {
  ok: boolean;
  message: string;
};

function hashOtp(email: string, otp: string) {
  return createHash('sha256').update(`${email}:${otp}`).digest('hex');
}

function safeEqualHash(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function readEnv(name: string) {
  return (process.env[name] || '').trim();
}

function getSupabaseConfig() {
  const url = readEnv('SUPABASE_URL') || readEnv('VITE_SUPABASE_URL') || readEnv('EXPO_PUBLIC_SUPABASE_URL');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('Server is missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return { url, serviceKey };
}

function getAdminClient(): SupabaseClient {
  const { url, serviceKey } = getSupabaseConfig();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { url, serviceKey } = getSupabaseConfig();
  const endpoint = `${url.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Unable to look up that email.');
  }
  const payload = (await response.json()) as { users?: Array<{ id: string; email?: string }> } | { id?: string };
  if ('users' in payload && Array.isArray(payload.users)) {
    const match = payload.users.find((u) => u.email?.toLowerCase() === email);
    return match?.id ?? payload.users[0]?.id ?? null;
  }
  if ('id' in payload && payload.id) return payload.id;
  return null;
}

async function sendMail(to: string, otp: string) {
  const host = readEnv('SMTP_HOST') || 'smtp.gmail.com';
  const port = Number(readEnv('SMTP_PORT') || '587');
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');
  const from = readEnv('SMTP_FROM') || user;
  if (!user || !pass || !from) {
    throw new Error('Server is missing SMTP_USER / SMTP_PASS / SMTP_FROM.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject: 'Your Viora password reset code',
    text: `Your Viora password reset code is ${otp}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Your Viora password reset code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p><p>It expires in 10 minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
  });
}

export async function handlePasswordOtp(body: PasswordOtpRequest): Promise<PasswordOtpResponse> {
  const action = body.action;
  const email = String(body.email || '')
    .trim()
    .toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }

  const supabase = getAdminClient();

  if (action === 'send') {
    const generic = {
      ok: true,
      message: 'If an account exists for that email, a one-time code is on the way.',
    };

    const userId = await findUserIdByEmail(email);
    if (!userId) return generic;

    const otp = String(randomInt(100000, 999999));
    const otpHash = hashOtp(email, otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('password_reset_otps').delete().eq('email', email).is('consumed_at', null);

    const { error: insertError } = await supabase.from('password_reset_otps').insert({
      email,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });
    if (insertError) throw new Error(insertError.message);

    await sendMail(email, otp);
    return generic;
  }

  if (action === 'reset') {
    const otp = String(body.otp || '').trim();
    const password = String(body.password || '');
    if (!/^\d{6}$/.test(otp)) throw new Error('Enter the 6-digit code from your email.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');

    const { data: rows, error } = await supabase
      .from('password_reset_otps')
      .select('id, otp_hash, attempts, expires_at, consumed_at')
      .eq('email', email)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);
    const row = rows?.[0] as
      | { id: string; otp_hash: string; attempts: number; expires_at: string; consumed_at: string | null }
      | undefined;
    if (!row) throw new Error('Invalid or expired code. Request a new one.');
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error('This code has expired. Request a new one.');
    }
    if (row.attempts >= 5) throw new Error('Too many attempts. Request a new code.');

    const ok = safeEqualHash(row.otp_hash, hashOtp(email, otp));
    if (!ok) {
      await supabase
        .from('password_reset_otps')
        .update({ attempts: row.attempts + 1 })
        .eq('id', row.id);
      throw new Error('Invalid or expired code. Request a new one.');
    }

    const userId = await findUserIdByEmail(email);
    if (!userId) throw new Error('Unable to reset password for that account.');

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password });
    if (updateError) throw new Error(updateError.message);

    await supabase
      .from('password_reset_otps')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', row.id);

    return { ok: true, message: 'Password updated. You can sign in with your new password.' };
  }

  throw new Error('Unknown action.');
}
