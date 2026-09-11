import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import type { ThemeMode } from '@viora/core';

type ThemePreference = 'system' | ThemeMode;

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ThemeMode;
  setPreference: (next: ThemePreference) => void;
};

const STORAGE_KEY = 'viora.themePreference';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  const systemScheme: ThemeMode = system === 'dark' ? 'dark' : 'light';
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const scheme: ThemeMode =
    preference === 'system' ? systemScheme : preference;

  const value = useMemo(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );

  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('AppThemeProvider is missing');
  return ctx;
}

/** Drop-in replacement used across screens — respects stored preference. */
export function useColorScheme(): ThemeMode {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx.scheme;
  const system = useSystemColorScheme();
  return system === 'dark' ? 'dark' : 'light';
}
