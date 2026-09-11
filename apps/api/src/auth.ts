import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import {
  DEMO_ACCOUNTS,
  avatarPath,
  pickAvatarId,
  type Gender,
  type UserProfile,
  type UserRole,
  type AccountStatus,
} from '@viora/shared';
import { createId, db, nowIso } from './db.ts';
import { SCHEMA_SQL } from './schema.ts';

const jwtSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'viora-dev-jwt-secret-change-in-production',
);

export type DbUser = {
  uid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: AccountStatus;
  gender: Gender | null;
  relation: string | null;
  photo_url: string | null;
  avatar_id: string | null;
  photo_manual: number | boolean | null;
  profile_setup_complete: number | boolean | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  deactivated_at: string | null;
};

export function mapUser(row: DbUser): UserProfile {
  return {
    uid: row.uid,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role,
    status: row.status,
    gender: row.gender ?? null,
    relation: row.relation ?? null,
    photoURL: row.photo_url,
    avatarId: row.avatar_id ?? null,
    photoManual: Boolean(row.photo_manual),
    profileSetupComplete: Boolean(row.profile_setup_complete),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    deactivatedAt: row.deactivated_at,
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function signToken(uid: string): Promise<string> {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(jwtSecret);
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    return typeof payload.uid === 'string' ? payload.uid : null;
  } catch {
    return null;
  }
}

export async function getUserByUid(uid: string): Promise<UserProfile | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE uid = ? LIMIT 1',
    args: [uid],
  });
  const row = result.rows[0] as unknown as DbUser | undefined;
  if (!row) return null;
  return ensureAvatar(mapUser(row));
}

/** Assign a name-based avatar when the user has none and no manual photo. */
export async function ensureAvatar(profile: UserProfile): Promise<UserProfile> {
  if (profile.photoManual) return profile;
  if (profile.avatarId && profile.photoURL) return profile;

  const fullName = `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
  const avatarId = pickAvatarId(fullName, profile.gender);
  const photoURL = avatarPath(avatarId);
  await db.execute({
    sql: `UPDATE users SET avatar_id = ?, photo_url = ?, photo_manual = 0, updated_at = ? WHERE uid = ?`,
    args: [avatarId, photoURL, nowIso(), profile.uid],
  });
  return {
    ...profile,
    avatarId,
    photoURL,
    photoManual: false,
    updatedAt: nowIso(),
  };
}

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE email = ? LIMIT 1',
    args: [email.toLowerCase()],
  });
  const row = result.rows[0] as unknown as DbUser | undefined;
  return row ? mapUser(row) : null;
}

export async function getUserByPhone(phone: string): Promise<UserProfile | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE phone = ? LIMIT 1',
    args: [phone],
  });
  const row = result.rows[0] as unknown as DbUser | undefined;
  return row ? mapUser(row) : null;
}

export async function findUsersByName(name: string): Promise<UserProfile[]> {
  const needle = name.trim().toLowerCase();
  const result = await db.execute({
    sql: `SELECT * FROM users
          WHERE lower(first_name) = ?
             OR lower(last_name) = ?
             OR lower(trim(first_name || ' ' || last_name)) = ?
             OR lower(first_name || ' ' || last_name) LIKE ?
          ORDER BY first_name, last_name, email`,
    args: [needle, needle, needle, `%${needle}%`],
  });
  return (result.rows as unknown as DbUser[]).map(mapUser);
}

export async function writeAudit(entry: {
  action: string;
  performedBy: string;
  targetUser?: string;
  targetRecord?: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  await db.execute({
    sql: `INSERT INTO audit_logs (id, action, performed_by, target_user, target_record, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      createId('audit'),
      entry.action,
      entry.performedBy,
      entry.targetUser ?? null,
      entry.targetRecord ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      nowIso(),
    ],
  });
}

async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  const result = await db.execute({
    sql: `SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ? LIMIT 1`,
    args: [table, column],
  });
  if (result.rows.length > 0) return;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function ensureSchemaUpgrades(): Promise<void> {
  await ensureColumn('users', 'phone', 'TEXT');
  await ensureColumn('users', 'gender', 'TEXT');
  await ensureColumn('users', 'relation', 'TEXT');
  await ensureColumn('users', 'avatar_id', 'TEXT');
  await ensureColumn('users', 'photo_manual', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('users', 'profile_setup_complete', 'INTEGER NOT NULL DEFAULT 1');

  // Unique phone when present (ignore nulls — Postgres allows multiple NULLs)
  try {
    await db.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (phone) WHERE phone IS NOT NULL`,
    );
  } catch {
    // index may already exist with different definition
  }

  // Allow passwordless accounts
  try {
    await db.execute(`ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL`);
  } catch {
    // already nullable or not postgres
  }
}

export async function runMigrations(): Promise<void> {
  const statements = SCHEMA_SQL.split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.execute(statement);
  }

  await ensureSchemaUpgrades();
  await seedDemoUsers();
}

async function seedDemoUsers(): Promise<void> {
  const existing = await db.execute({
    sql: 'SELECT uid FROM users WHERE email = ? LIMIT 1',
    args: [DEMO_ACCOUNTS.admin.email],
  });
  if (existing.rows.length > 0) {
    // Backfill phones on demo accounts if missing
    await db.execute({
      sql: `UPDATE users SET phone = COALESCE(phone, ?) WHERE email = ?`,
      args: ['+910000000001', DEMO_ACCOUNTS.admin.email],
    });
    await db.execute({
      sql: `UPDATE users SET phone = COALESCE(phone, ?) WHERE email = ?`,
      args: ['+910000000002', DEMO_ACCOUNTS.user.email],
    });

    const jane2 = await db.execute({
      sql: 'SELECT uid FROM users WHERE email = ? LIMIT 1',
      args: ['jane2@viora.app'],
    });
    if (jane2.rows.length === 0) {
      const now = nowIso();
      const jane2Uid = 'user_jane2_seed';
      const avatar = pickAvatarId('Jane Carter Two', 'female');
      await db.batch(
        [
          {
            sql: `INSERT INTO users (uid, first_name, last_name, email, phone, role, status, gender, relation, photo_url, avatar_id, photo_manual, profile_setup_complete, created_at, updated_at, last_login_at, deactivated_at)
                  VALUES (?, 'Jane', 'Carter', 'jane2@viora.app', '+910000000003', 'user', 'active', 'female', 'cousin', ?, ?, 0, 0, ?, ?, NULL, NULL)`,
            args: [jane2Uid, avatarPath(avatar), avatar, now, now],
          },
          {
            sql: `INSERT INTO accounts (email, uid, password_hash) VALUES (?, ?, NULL)`,
            args: ['jane2@viora.app', jane2Uid],
          },
        ],
        'write',
      );
    }
    return;
  }

  const now = nowIso();
  const adminUid = 'user_admin_seed';
  const userUid = 'user_jane_seed';
  const jane2Uid = 'user_jane2_seed';
  const adminAvatar = pickAvatarId('Viora Admin', 'male');
  const janeAvatar = pickAvatarId('Jane Carter', 'female');

  await db.batch(
    [
      {
        sql: `INSERT INTO users (uid, first_name, last_name, email, phone, role, status, gender, relation, photo_url, avatar_id, photo_manual, profile_setup_complete, created_at, updated_at, last_login_at, deactivated_at)
              VALUES (?, ?, ?, ?, ?, 'admin', 'active', 'male', 'other', ?, ?, 0, 1, ?, ?, NULL, NULL)`,
        args: [
          adminUid,
          DEMO_ACCOUNTS.admin.firstName,
          DEMO_ACCOUNTS.admin.lastName,
          DEMO_ACCOUNTS.admin.email,
          '+910000000001',
          avatarPath(adminAvatar),
          adminAvatar,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO accounts (email, uid, password_hash) VALUES (?, ?, ?)`,
        args: [DEMO_ACCOUNTS.admin.email, adminUid, hashPassword(DEMO_ACCOUNTS.admin.password)],
      },
      {
        sql: `INSERT INTO users (uid, first_name, last_name, email, phone, role, status, gender, relation, photo_url, avatar_id, photo_manual, profile_setup_complete, created_at, updated_at, last_login_at, deactivated_at)
              VALUES (?, ?, ?, ?, ?, 'user', 'active', 'female', 'friend', ?, ?, 0, 1, ?, ?, NULL, NULL)`,
        args: [
          userUid,
          DEMO_ACCOUNTS.user.firstName,
          DEMO_ACCOUNTS.user.lastName,
          DEMO_ACCOUNTS.user.email,
          '+910000000002',
          avatarPath(janeAvatar),
          janeAvatar,
          now,
          now,
        ],
      },
      {
        sql: `INSERT INTO accounts (email, uid, password_hash) VALUES (?, ?, ?)`,
        args: [DEMO_ACCOUNTS.user.email, userUid, hashPassword(DEMO_ACCOUNTS.user.password)],
      },
      {
        sql: `INSERT INTO users (uid, first_name, last_name, email, phone, role, status, gender, relation, photo_url, avatar_id, photo_manual, profile_setup_complete, created_at, updated_at, last_login_at, deactivated_at)
              VALUES (?, 'Jane', 'Carter', 'jane2@viora.app', '+910000000003', 'user', 'active', 'female', 'cousin', ?, ?, 0, 0, ?, ?, NULL, NULL)`,
        args: [jane2Uid, avatarPath(pickAvatarId('Jane Carter Two', 'female')), pickAvatarId('Jane Carter Two', 'female'), now, now],
      },
      {
        sql: `INSERT INTO accounts (email, uid, password_hash) VALUES (?, ?, NULL)`,
        args: ['jane2@viora.app', jane2Uid],
      },
      {
        sql: `INSERT INTO records (id, user_id, title, description, status, deleted, deleted_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'active', 0, NULL, ?, ?)`,
        args: [
          'rec_welcome',
          userUid,
          'Welcome to Viora',
          'This is a sample record stored in Postgres.',
          now,
          now,
        ],
      },
    ],
    'write',
  );
}
