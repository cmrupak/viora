/**
 * Shared screen flow for web + mobile.
 * Phase 1: shell only. Auth/feed implemented in later phases.
 */
export const SCREEN_FLOW = [
  { id: 'welcome', title: 'Welcome', phase: 1 },
  { id: 'login', title: 'Login', phase: 2 },
  { id: 'register', title: 'Register', phase: 2 },
  { id: 'feed', title: 'Home', phase: 4 },
  { id: 'explore', title: 'Explore', phase: 4 },
  { id: 'create', title: 'Create', phase: 4 },
  { id: 'notifications', title: 'Alerts', phase: 7 },
  { id: 'messages', title: 'Messages', phase: 8 },
  { id: 'profile', title: 'Profile', phase: 3 },
  { id: 'settings', title: 'Settings', phase: 9 },
] as const;

export type ScreenFlowId = (typeof SCREEN_FLOW)[number]['id'];
