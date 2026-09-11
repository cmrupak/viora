import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Profile, SessionUser } from './types';

export type AuthRegisterInput = {
  email: string;
  password: string;
  username: string;
  displayName: string;
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
      const username = input.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      const displayName = input.displayName.trim();

      if (!email || !input.password || username.length < 3 || !displayName) {
        throw new Error('Enter a valid email, username (3+), display name, and password.');
      }
      if (input.password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: input.password,
        options: {
          data: {
            username,
            display_name: displayName,
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
