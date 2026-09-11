import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Profile, SessionUser } from './types';

export type AuthRegisterInput = {
  email: string;
  password: string;
  /** Optional — auto-generated uniquely when omitted */
  username?: string;
  /** @deprecated prefer firstName + lastName */
  displayName?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
};

export type AuthLoginInput = {
  email: string;
  password: string;
};

export type AuthResult = {
  user: SessionUser | null;
  session: Session | null;
  needsEmailVerification?: boolean;
};

function mapUser(user: User | null): SessionUser | null {
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

function sanitizeUsernamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '')
    .replace(/^_+|_+$/g, '');
}

function buildUsernameBase(input: {
  username?: string;
  firstName?: string;
  lastName?: string;
  email: string;
}) {
  const provided = sanitizeUsernamePart(input.username ?? '');
  if (provided.length >= 3) return provided.slice(0, 24);

  const first = sanitizeUsernamePart(input.firstName ?? '');
  const last = sanitizeUsernamePart(input.lastName ?? '');
  const fromName = sanitizeUsernamePart(`${first}${last}` || `${first}_${last}`);
  if (fromName.length >= 3) return fromName.slice(0, 24);

  const fromEmail = sanitizeUsernamePart(input.email.split('@')[0] ?? '');
  if (fromEmail.length >= 3) return fromEmail.slice(0, 24);

  return `user${Date.now().toString(36).slice(-6)}`;
}

async function allocateUniqueUsername(
  supabase: SupabaseClient,
  input: { username?: string; firstName?: string; lastName?: string; email: string },
): Promise<string> {
  const base = buildUsernameBase(input);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate =
      attempt === 0 ? base : `${base.slice(0, 18)}${Math.floor(1000 + Math.random() * 9000)}`;
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();
    if (error && !/permission|rls|policy/i.test(error.message)) {
      throw new Error(toUserError(error));
    }
    if (!data) return candidate;
  }
  return `${base.slice(0, 12)}${Date.now().toString(36)}`.slice(0, 24);
}

export function createAuthService(supabase: SupabaseClient) {
  return {
    async getSession(): Promise<AuthResult> {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error(toUserError(error));
      return {
        user: mapUser(data.session?.user ?? null),
        session: data.session,
      };
    },

    onAuthStateChange(callback: (result: AuthResult) => void) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        callback({
          user: mapUser(session?.user ?? null),
          session,
        });
      });
      return () => data.subscription.unsubscribe();
    },

    async register(input: AuthRegisterInput): Promise<AuthResult> {
      const email = input.email.trim().toLowerCase();
      const firstName = (input.firstName ?? '').trim();
      const lastName = (input.lastName ?? '').trim();
      const displayName =
        [firstName, lastName].filter(Boolean).join(' ').trim() || (input.displayName ?? '').trim();
      const dateOfBirth = (input.dateOfBirth ?? '').trim();
      const gender = (input.gender ?? '').trim();
      const username = await allocateUniqueUsername(supabase, {
        username: input.username,
        firstName,
        lastName,
        email,
      });

      if (!email || !input.password || !displayName) {
        throw new Error('Enter a valid email, name, and password.');
      }
      if (input.password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        throw new Error('Enter a valid date of birth.');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          data: {
            username,
            display_name: displayName,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dateOfBirth || null,
            gender,
          },
        },
      });

      if (error) throw new Error(toUserError(error));

      return {
        user: mapUser(data.user),
        session: data.session,
        needsEmailVerification: !data.session,
      };
    },

    async login(input: AuthLoginInput): Promise<AuthResult> {
      const email = input.email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: input.password,
      });
      if (error) throw new Error(toUserError(error));
      return {
        user: mapUser(data.user),
        session: data.session,
      };
    },

    async logout(): Promise<void> {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(toUserError(error));
    },

    async requestPasswordReset(email: string, options?: { redirectTo?: string }): Promise<void> {
      const value = email.trim().toLowerCase();
      if (!value) throw new Error('Enter your email address.');
      const { error } = await supabase.auth.resetPasswordForEmail(value, {
        redirectTo: options?.redirectTo,
      });
      if (error) throw new Error(toUserError(error));
    },

    async updatePassword(password: string): Promise<void> {
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(toUserError(error));
    },

    async getProfile(userId: string): Promise<Profile | null> {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(toUserError(error));
      return mapProfileRow(data as Record<string, unknown> | null);
    },

    async ensureProfile(userId: string): Promise<Profile | null> {
      const existing = await this.getProfile(userId);
      if (existing) return existing;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return this.getProfile(userId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
