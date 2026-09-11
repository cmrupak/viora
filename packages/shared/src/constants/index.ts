export const APP_NAME = 'CRUD';
export const APP_WEB_NAME = 'CRUD Web';
export const APP_MOBILE_NAME = 'CRUD Mobile';

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
} as const;

export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export const RECORD_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export const MIN_PASSWORD_LENGTH = 8;

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const DEFAULT_PAGE_SIZE = 10;

export const ROUTES = {
  WELCOME: '/welcome',
  GET_STARTED: '/get-started',
  CONTINUE: '/continue',
  LOGIN: '/continue',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password',
  DEACTIVATED: '/account-deactivated',
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  RECORDS: '/records',
  RECORDS_CREATE: '/records/create',
  ADMIN_USERS: '/admin/users',
  ADMIN_RECORDS: '/admin/records',
} as const;

export const MESSAGES = {
  ACCOUNT_CREATED: 'Account created successfully.',
  LOGIN_SUCCESS: 'Login successful.',
  LOGOUT_SUCCESS: 'You have been signed out.',
  RESET_EMAIL_SENT: 'If an account exists for that email, a reset link has been sent.',
  PASSWORD_RESET: 'Password updated successfully. You can now sign in.',
  RECORD_CREATED: 'Record created successfully.',
  RECORD_UPDATED: 'Record updated successfully.',
  RECORD_DELETED: 'Record deleted successfully.',
  USER_DEACTIVATED: 'User deactivated successfully.',
  USER_ACTIVATED: 'User activated successfully.',
  USER_UPDATED: 'User updated successfully.',
  PROFILE_UPDATED: 'Profile updated successfully.',
  PHOTO_UPDATED: 'Profile photo updated successfully.',
  ACCOUNT_DEACTIVATED: 'Your account has been deactivated.',
  SAVE_RECORD_ERROR: 'Unable to save record.',
  LOAD_USERS_ERROR: 'Unable to load users.',
  LOAD_RECORDS_ERROR: 'Unable to load records.',
  UPDATE_PROFILE_ERROR: 'Unable to update profile.',
  INACTIVE_LOGIN:
    'Your account has been deactivated. Please contact an administrator.',
} as const;

export const DEMO_ACCOUNTS = {
  admin: {
    email: 'admin@viora.app',
    password: 'Admin123!',
    firstName: 'Viora',
    lastName: 'Admin',
  },
  user: {
    email: 'jane@viora.app',
    password: 'User123!',
    firstName: 'Jane',
    lastName: 'Carter',
  },
} as const;
