/** Client helper for custom SMTP OTP password reset (not Supabase reset email). */
export async function passwordOtpRequest(input: {
  action: 'send' | 'reset';
  email: string;
  otp?: string;
  password?: string;
}): Promise<{ ok: boolean; message: string }> {
  const response = await fetch('/api/password-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || 'Unable to process password reset.');
  }
  return { ok: true, message: payload.message || 'OK' };
}
