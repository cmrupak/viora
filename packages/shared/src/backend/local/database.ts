import { DEMO_ACCOUNTS } from '../../constants';
import { AppError, ERROR_CODES } from '../../errors';
import type { KeyValueStorage } from '../../storage';
import type {
  AuditLog,
  RecordItem,
  SessionUser,
  UserProfile,
} from '../../types';
import { createId, hashPassword, nowIso } from '../../utils';

const DB_KEY = 'viora.local.db.v1';

export interface LocalAccount {
  uid: string;
  email: string;
  passwordHash: string;
}

export interface LocalDb {
  accounts: Record<string, LocalAccount>;
  users: Record<string, UserProfile>;
  records: Record<string, RecordItem>;
  auditLogs: Record<string, AuditLog>;
  session: SessionUser | null;
  resetAllowlist: Record<string, boolean>;
}

async function seedDb(): Promise<LocalDb> {
  const now = nowIso();
  const adminUid = 'user_admin_seed';
  const userUid = 'user_jane_seed';
  const adminHash = await hashPassword(DEMO_ACCOUNTS.admin.password);
  const userHash = await hashPassword(DEMO_ACCOUNTS.user.password);

  const admin: UserProfile = {
    uid: adminUid,
    firstName: DEMO_ACCOUNTS.admin.firstName,
    lastName: DEMO_ACCOUNTS.admin.lastName,
    email: DEMO_ACCOUNTS.admin.email,
    phone: '+910000000001',
    role: 'admin',
    status: 'active',
    gender: 'male',
    relation: 'other',
    photoURL: null,
    avatarId: null,
    photoManual: false,
    profileSetupComplete: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };

  const user: UserProfile = {
    uid: userUid,
    firstName: DEMO_ACCOUNTS.user.firstName,
    lastName: DEMO_ACCOUNTS.user.lastName,
    email: DEMO_ACCOUNTS.user.email,
    phone: '+910000000002',
    role: 'user',
    status: 'active',
    gender: 'female',
    relation: 'friend',
    photoURL: null,
    avatarId: null,
    photoManual: false,
    profileSetupComplete: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };

  const sampleRecords: RecordItem[] = [
    {
      id: 'rec_welcome',
      userId: userUid,
      title: 'Welcome to Viora',
      description: 'This is a sample record you can view, edit, or delete.',
      status: 'active',
      deleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rec_ops',
      userId: adminUid,
      title: 'Operations checklist',
      description: 'Admin-owned record visible on the All Records screen.',
      status: 'active',
      deleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    accounts: {
      [admin.email]: { uid: adminUid, email: admin.email, passwordHash: adminHash },
      [user.email]: { uid: userUid, email: user.email, passwordHash: userHash },
    },
    users: {
      [adminUid]: admin,
      [userUid]: user,
    },
    records: {
      rec_welcome: sampleRecords[0]!,
      rec_ops: sampleRecords[1]!,
    },
    auditLogs: {},
    session: null,
    resetAllowlist: {},
  };
}

export class LocalDatabase {
  private cache: LocalDb | null = null;

  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<LocalDb> {
    if (this.cache) return this.cache;
    const raw = await this.storage.getItem(DB_KEY);
    if (!raw) {
      this.cache = await seedDb();
      await this.persist();
      return this.cache;
    }
    this.cache = JSON.parse(raw) as LocalDb;
    return this.cache;
  }

  async persist(): Promise<void> {
    if (!this.cache) return;
    await this.storage.setItem(DB_KEY, JSON.stringify(this.cache));
  }

  async update(mutator: (db: LocalDb) => void): Promise<LocalDb> {
    const db = await this.load();
    mutator(db);
    await this.persist();
    return db;
  }

  async requireSession(): Promise<SessionUser> {
    const db = await this.load();
    if (!db.session) {
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Please sign in to continue.');
    }
    const profile = db.users[db.session.profile.uid];
    if (!profile) {
      db.session = null;
      await this.persist();
      throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'Please sign in to continue.');
    }
    if (profile.status === 'inactive') {
      db.session = null;
      await this.persist();
      throw new AppError(
        ERROR_CODES.ACCOUNT_INACTIVE,
        'Your account has been deactivated. Please contact an administrator.',
      );
    }
    db.session.profile = profile;
    return db.session;
  }

  async requireAdmin(): Promise<SessionUser> {
    const session = await this.requireSession();
    if (session.profile.role !== 'admin') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'You do not have access to this action.');
    }
    return session;
  }

  async writeAudit(entry: Omit<AuditLog, 'id' | 'createdAt'>): Promise<void> {
    await this.update((db) => {
      const id = createId('audit');
      db.auditLogs[id] = { ...entry, id, createdAt: nowIso() };
    });
  }
}
