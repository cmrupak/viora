export type ThemeMode = 'light' | 'dark';

export const lightColors = {
  bg: '#F6F1E8',
  surface: '#FFFCF7',
  ink: '#1C1917',
  muted: '#78716C',
  line: '#E7E0D5',
  brand: '#0F766E',
  brandSoft: '#CCFBF1',
  accent: '#C2410C',
  danger: '#B91C1C',
  success: '#15803D',
} as const;

export const darkColors = {
  bg: '#0C1110',
  surface: '#151B19',
  ink: '#F5F5F4',
  muted: '#A8A29E',
  line: '#292524',
  brand: '#2DD4BF',
  brandSoft: '#134E4A',
  accent: '#FB923C',
  danger: '#F87171',
  success: '#4ADE80',
} as const;

export type BrandColors = {
  readonly bg: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly brand: string;
  readonly brandSoft: string;
  readonly accent: string;
  readonly danger: string;
  readonly success: string;
};

export function colorsFor(mode: ThemeMode): BrandColors {
  return mode === 'dark' ? darkColors : lightColors;
}
