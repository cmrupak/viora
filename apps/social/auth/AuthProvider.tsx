import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createVioraApi,
  getVioraSupabase,
  type AuthLoginInput,
  type AuthRegisterInput,
  type Profile,
  type SessionUser,
  type VioraApi,
} from '@viora/core';
import { readSupabaseEnv } from '@/lib/supabase';

type AuthContextValue = {
  ready: boolean;
  user: SessionUser | null;
  profile: Profile | null;
  configured: boolean;
  api: VioraApi | null;
  setProfile: (profile: Profile | null) => void;
  login: (input: AuthLoginInput) => Promise<void>;
  register: (input: AuthRegisterInput) => Promise<{ needsEmailVerification: boolean }>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string, options?: { redirectTo?: string }) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const env = readSupabaseEnv();
  const configured = Boolean(env.url && env.anonKey && !env.url.includes('YOUR_PROJECT'));

  const api = useMemo<VioraApi | null>(() => {
    if (!configured) return null;
    const supabase = getVioraSupabase({
      url: env.url,
      anonKey: env.anonKey,
      detectSessionInUrl: false,
      storage: AsyncStorage,
    });
    return createVioraApi(supabase);
  }, [configured, env.anonKey, env.url]);

  const [ready, setReady] = useState(!configured);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!api || !user) {
      setProfile(null);
      return;
    }
    setProfile(await api.auth.ensureProfile(user.id));
  }, [api, user]);

  useEffect(() => {
    if (!api) return;
    let active = true;

    void (async () => {
      try {
        const session = await api.auth.getSession();
        if (!active) return;
        setUser(session.user);
        if (session.user) {
          setProfile(await api.auth.ensureProfile(session.user.id));
        }
      } finally {
        if (active) setReady(true);
      }
    })();

    const unsubscribe = api.auth.onAuthStateChange(async (result) => {
      setUser(result.user);
      if (result.user) {
        setProfile(await api.auth.ensureProfile(result.user.id));
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      profile,
      configured,
      api,
      setProfile,
      async login(input) {
        if (!api) throw new Error('Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/social/.env');
        const result = await api.auth.login(input);
        setUser(result.user);
        if (result.user) setProfile(await api.auth.ensureProfile(result.user.id));
      },
      async register(input) {
        if (!api) throw new Error('Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/social/.env');
        const result = await api.auth.register(input);
        setUser(result.user);
        if (result.user) setProfile(await api.auth.ensureProfile(result.user.id));
        return { needsEmailVerification: Boolean(result.needsEmailVerification) };
      },
      async logout() {
        if (!api) return;
        await api.auth.logout();
        setUser(null);
        setProfile(null);
      },
      async requestPasswordReset(email, options) {
        if (!api) throw new Error('Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/social/.env');
        await api.auth.requestPasswordReset(email, options);
      },
      async updatePassword(password) {
        if (!api) throw new Error('Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/social/.env');
        await api.auth.updatePassword(password);
      },
      refreshProfile,
    }),
    [api, configured, profile, ready, refreshProfile, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
