/** Original product brand — not Facebook clone. */
export const BRAND = {
  name: 'Viora',
  tagline: 'Share what moves you',
  scheme: 'viora',
} as const;

/** Shared route ids — web and mobile use the same flow map. */
export const APP_ROUTES = {
  welcome: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  feed: '/feed',
  explore: '/explore',
  create: '/create',
  notifications: '/notifications',
  messages: '/messages',
  profile: '/profile',
  settings: '/settings',
} as const;

export type AppRouteId = keyof typeof APP_ROUTES;
