import type {
  DashboardStats,
  IdentifyInput,
  IdentifyResult,
  ListQuery,
  LoginInput,
  PaginatedResult,
  ProfileSetupInput,
  ProfileUpdateInput,
  RecordInput,
  RecordItem,
  RegisterInput,
  SessionUser,
  UserProfile,
  UserRole,
} from '../types';

export interface AuthService {
  identify(input: IdentifyInput): Promise<IdentifyResult>;
  loginByUid(uid: string): Promise<UserProfile>;
  register(input: RegisterInput): Promise<UserProfile>;
  setupProfile(input: ProfileSetupInput): Promise<UserProfile>;
  /** @deprecated password login for demo accounts */
  login(input: LoginInput): Promise<UserProfile>;
  logout(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  confirmPasswordReset(email: string, password: string): Promise<void>;
  getCurrentUser(): Promise<UserProfile | null>;
  refreshUser(): Promise<UserProfile | null>;
}

export interface UserService {
  getById(uid: string): Promise<UserProfile>;
  updateProfile(uid: string, input: ProfileUpdateInput): Promise<UserProfile>;
  deactivateSelf(): Promise<void>;
}

export interface RecordService {
  create(input: RecordInput): Promise<RecordItem>;
  getById(id: string): Promise<RecordItem>;
  listMine(query?: ListQuery): Promise<PaginatedResult<RecordItem>>;
  listAll(query?: ListQuery): Promise<PaginatedResult<RecordItem>>;
  update(id: string, input: RecordInput): Promise<RecordItem>;
  softDelete(id: string): Promise<void>;
}

export interface AdminService {
  listUsers(query?: ListQuery): Promise<PaginatedResult<UserProfile>>;
  getUser(uid: string): Promise<UserProfile>;
  updateUser(
    uid: string,
    input: ProfileUpdateInput & { role?: UserRole },
  ): Promise<UserProfile>;
  activateUser(uid: string): Promise<UserProfile>;
  deactivateUser(uid: string): Promise<UserProfile>;
  changeRole(uid: string, role: UserRole): Promise<UserProfile>;
}

export interface FileStorageService {
  uploadProfileImage(file: Blob, fileName: string, contentType: string): Promise<string>;
}

export interface StatsService {
  getDashboardStats(): Promise<DashboardStats>;
}

export interface VioraBackend {
  kind: 'local' | 'api';
  auth: AuthService;
  users: UserService;
  records: RecordService;
  admin: AdminService;
  files: FileStorageService;
  stats: StatsService;
}

export interface BackendContext {
  getSession(): Promise<SessionUser | null>;
}
