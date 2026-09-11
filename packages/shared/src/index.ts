export type {
  AccountStatus,
  AuditAction,
  AuditLog,
  DashboardStats,
  DataSource,
  Gender,
  IdentifyInput,
  IdentifyResult,
  ListQuery,
  LoginCandidate,
  LoginInput,
  PaginatedResult,
  ProfileSetupInput,
  ProfileUpdateInput,
  RecordInput,
  RecordItem,
  RecordStatus,
  RegisterInput,
  RelationValue,
  SessionUser,
  UserProfile,
  UserRole,
} from './types';

export { RELATION_OPTIONS } from './types';

export {
  ACCOUNT_STATUS,
  ALLOWED_IMAGE_TYPES,
  APP_MOBILE_NAME,
  APP_NAME,
  APP_WEB_NAME,
  DEFAULT_PAGE_SIZE,
  DEMO_ACCOUNTS,
  MAX_IMAGE_BYTES,
  MESSAGES,
  MIN_PASSWORD_LENGTH,
  RECORD_STATUS,
  ROLES,
  ROUTES,
} from './constants';

export {
  validateEmail,
  validateIdentify,
  validateImageFile,
  validateLogin,
  validatePassword,
  validatePasswordReset,
  validatePhone,
  validateProfile,
  validateProfileSetup,
  validateRecord,
  validateRegistration,
} from './validation';
export type { FieldErrors, ValidationResult } from './validation';

export { AppError, ERROR_CODES, getErrorMessage, toAppError } from './errors';
export type { ErrorCode } from './errors';

export {
  avatarPath,
  displayRelation,
  hashName,
  normalizePhone,
  pickAvatarId,
  resolveProfilePhotoUrl,
  splitFullName,
} from './avatar';

export {
  IDENTIFIER_PLACEHOLDERS,
  ONBOARDING_MESSAGES,
  classifyIdentifier,
  toIdentifyInput,
  validateIdentifierInput,
} from './onboarding';
export type { IdentifierKind } from './onboarding';

export { createMemoryStorage, createWebStorage } from './storage';
export type { KeyValueStorage } from './storage';

export { createId, displayName, formatDate, formatDateTime, hashPassword, matchesSearch, nowIso, paginate } from './utils';

export { createLocalBackend } from './backend/local';
export { createHttpBackend } from './backend/http';
export type {
  AdminService,
  AuthService,
  FileStorageService,
  VioraBackend,
  RecordService,
  StatsService,
  UserService,
} from './backend/types';
