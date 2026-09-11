export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function validateLogin(input: { email: string; password: string }) {
  const errors: Partial<Record<'email' | 'password', string>> = {};
  if (!input.email.trim()) errors.email = 'Email is required.';
  else if (!isValidEmail(input.email)) errors.email = 'Enter a valid email address.';
  if (!input.password) errors.password = 'Password is required.';
  else if (input.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  return errors;
}

export function validateRegister(input: {
  displayName: string;
  username: string;
  email: string;
  password: string;
}) {
  const errors: Partial<Record<'displayName' | 'username' | 'email' | 'password', string>> = {};
  if (!input.displayName.trim()) errors.displayName = 'Display name is required.';
  const username = input.username.trim().toLowerCase();
  if (!username) errors.username = 'Username is required.';
  else if (username.length < 3) errors.username = 'Username must be at least 3 characters.';
  else if (!/^[a-z0-9_]+$/.test(username)) errors.username = 'Use letters, numbers, and underscores only.';
  if (!input.email.trim()) errors.email = 'Email is required.';
  else if (!isValidEmail(input.email)) errors.email = 'Enter a valid email address.';
  if (!input.password) errors.password = 'Password is required.';
  else if (input.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  return errors;
}
