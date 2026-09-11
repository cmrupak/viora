/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './auth/**/*.{js,jsx,ts,tsx}',
    './design/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
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
      },
    },
  },
  plugins: [],
};
