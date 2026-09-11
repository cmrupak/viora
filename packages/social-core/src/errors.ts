export function toUserError(error: unknown): string {
  if (!error) return 'Something went wrong. Please try again.';

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message || '')
      : error instanceof Error
        ? error.message
        : '';

  if (/network|fetch|offline|Failed to fetch/i.test(message)) {
    return "You're offline. Check your connection and try again.";
  }
  if (/Invalid login credentials/i.test(message)) {
    return 'Invalid email or password.';
  }
  if (/User already registered|already been registered/i.test(message)) {
    return 'An account already exists with this email.';
  }
  if (/Password should be at least/i.test(message)) {
    return 'Password must be at least 8 characters.';
  }
  if (/Email not confirmed/i.test(message)) {
    return 'Please verify your email before signing in.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Too many attempts. Please try again later.';
  }
  if (message && message.length < 120 && !/Postgrest|PGRST|JWT|stack/i.test(message)) {
    return message;
  }

  return 'Something went wrong. Please try again.';
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return toUserError(error);
  }
  return toUserError(error);
}
