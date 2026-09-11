export const brand = {
  name: 'Viora',
  tagline: 'Share what moves you',
} as const;

export const tokens = {
  light: {
    bg: '#F8FAFC',
    surface: '#FFFFFF',
    surface2: '#F1F5F9',
    primary: '#2563EB',
    primaryDark: '#1D4ED8',
    primarySoft: '#DBEAFE',
    ink: '#0F172A',
    muted: '#64748B',
    border: '#E2E8F0',
    success: '#16A34A',
    danger: '#DC2626',
    warning: '#D97706',
  },
  dark: {
    bg: '#0B1220',
    surface: '#111827',
    surface2: '#1F2937',
    primary: '#3B82F6',
    primaryDark: '#60A5FA',
    primarySoft: '#1E3A8A',
    ink: '#F8FAFC',
    muted: '#94A3B8',
    border: '#334155',
    success: '#22C55E',
    danger: '#F87171',
    warning: '#FBBF24',
  },
} as const;

export type ThemeMode = 'light' | 'dark';

export function themeColors(mode: ThemeMode) {
  return mode === 'dark' ? tokens.dark : tokens.light;
}

export const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const radii = {
  button: 12,
  card: 18,
  input: 12,
  avatar: 9999,
  media: 18,
} as const;

export const typography = {
  display: { size: 32, weight: '700' as const },
  h1: { size: 28, weight: '700' as const },
  h2: { size: 22, weight: '700' as const },
  h3: { size: 18, weight: '600' as const },
  body: { size: 15, weight: '500' as const },
  small: { size: 13, weight: '500' as const },
  caption: { size: 12, weight: '500' as const },
} as const;

export const layout = {
  leftSidebar: 260,
  centerMax: 680,
  rightSidebar: 320,
  headerHeight: 64,
  bottomNavHeight: 64,
} as const;
