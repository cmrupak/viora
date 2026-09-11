import { Router } from 'express';
import {
  AppError,
  ERROR_CODES,
  MESSAGES,
  avatarPath,
  displayName,
  normalizePhone,
  pickAvatarId,
  splitFullName,
  validateIdentify,
  validateLogin,
  validatePasswordReset,
  validateProfileSetup,
  validateRegistration,
  type IdentifyResult,
  type LoginCandidate,
  type UserProfile,
} from '@viora/shared';
import {
  findUsersByName,
  getUserByEmail,
  getUserByPhone,
  getUserByUid,
  hashPassword,
  signToken,
  verifyPassword,
  writeAudit,
} from '../auth.ts';
import { createId, db, nowIso } from '../db.ts';
import { asyncHandler, requireAuth, type AuthedRequest } from '../middleware.ts';

export const authRouter = Router();

function toCandidate(user: UserProfile): LoginCandidate {
  return {
    uid: user.uid,
    fullName: displayName(user),
    email: user.email,
    phone: user.phone,
    photoURL: user.photoURL,
    avatarId: user.avatarId,
  };
}

async function completeLogin(profile: UserProfile) {
  if (profile.status === 'inactive') {
    throw new AppError(ERROR_CODES.ACCOUNT_INACTIVE, MESSAGES.INACTIVE_LOGIN);
  }
  const now = nowIso();
  await db.execute({
    sql: 'UPDATE users SET last_login_at = ?, updated_at = ? WHERE uid = ?',
    args: [now, now, profile.uid],
  });
  const token = await signToken(profile.uid);
  return {
    token,
    user: { ...profile, lastLoginAt: now, updatedAt: now },
  };
}

authRouter.post(
  '/identify',
  asyncHandler(async (req, res) => {
    const input = {
      email: String(req.body.email ?? ''),
      name: String(req.body.name ?? ''),
      phone: String(req.body.phone ?? ''),
    };
    const validation = validateIdentify(input);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }

    const email = input.email.trim().toLowerCase();
    const phone = normalizePhone(input.phone);
    const name = input.name.trim();

    // Prefer unique identifiers first
    if (email) {
      const byEmail = await getUserByEmail(email);
      if (byEmail) {
        const loggedIn = await completeLogin(byEmail);
        const body: IdentifyResult = { status: 'authenticated', ...loggedIn };
        res.json(body);
        return;
      }
    }

    if (phone) {
      const byPhone = await getUserByPhone(phone);
      if (byPhone) {
        const loggedIn = await completeLogin(byPhone);
        const body: IdentifyResult = { status: 'authenticated', ...loggedIn };
        res.json(body);
        return;
      }
    }

    if (name) {
      const matches = await findUsersByName(name);
      if (matches.length === 1) {
        const loggedIn = await completeLogin(matches[0]);
        const body: IdentifyResult = { status: 'authenticated', ...loggedIn };
        res.json(body);
        return;
      }
      if (matches.length > 1) {
        const body: IdentifyResult = {
          status: 'candidates',
          candidates: matches.map(toCandidate),
        };
        res.json(body);
        return;
      }
    }

    const body: IdentifyResult = {
      status: 'not_found',
      message: "We couldn't find an account with those details.",
    };
    res.json(body);
  }),
);

authRouter.post(
  '/login-uid',
  asyncHandler(async (req, res) => {
    const uid = String(req.body.uid ?? '');
    if (!uid) throw new AppError(ERROR_CODES.VALIDATION, 'Select an account to continue.');
    const profile = await getUserByUid(uid);
    if (!profile) throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User profile was not found.');
    res.json(await completeLogin(profile));
  }),
);

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const validation = validateRegistration(req.body);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }

    const email = String(req.body.email).trim().toLowerCase();
    const phone = normalizePhone(String(req.body.phone));
    const { firstName, lastName } = splitFullName(String(req.body.fullName));
    const gender = req.body.gender as 'male' | 'female';
    const relation =
      req.body.relation === 'other'
        ? String(req.body.relationOther ?? '').trim()
        : String(req.body.relation).trim();

    const existingEmail = await getUserByEmail(email);
    if (existingEmail) {
      throw new AppError(ERROR_CODES.EMAIL_IN_USE, 'An account already exists with this email.');
    }
    const existingPhone = await getUserByPhone(phone);
    if (existingPhone) {
      throw new AppError(ERROR_CODES.VALIDATION, 'An account already exists with this phone number.', {
        phone: 'Phone number already in use.',
      });
    }

    const uid = createId('user');
    const now = nowIso();
    const fullName = `${firstName} ${lastName}`.trim();
    const avatarId = pickAvatarId(fullName, gender);
    const photoURL = avatarPath(avatarId);
    await db.batch(
      [
        {
          sql: `INSERT INTO users (uid, first_name, last_name, email, phone, role, status, gender, relation, photo_url, avatar_id, photo_manual, profile_setup_complete, created_at, updated_at, last_login_at, deactivated_at)
                VALUES (?, ?, ?, ?, ?, 'user', 'active', ?, ?, ?, ?, 0, 1, ?, ?, ?, NULL)`,
          args: [uid, firstName, lastName, email, phone, gender, relation, photoURL, avatarId, now, now, now],
        },
        {
          sql: `INSERT INTO accounts (email, uid, password_hash) VALUES (?, ?, NULL)`,
          args: [email, uid],
        },
      ],
      'write',
    );
    await writeAudit({ action: 'USER_CREATED', performedBy: uid, targetUser: uid });
    const profile = await getUserByUid(uid);
    const token = await signToken(uid);
    res.status(201).json({ token, user: profile });
  }),
);

authRouter.post(
  '/setup-profile',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const validation = validateProfileSetup(req.body);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }

    const uid = req.user!.uid;
    const now = nowIso();

    if (req.body.skip) {
      // Leave profile incomplete; client should not force again this session
      res.json({ user: await getUserByUid(uid), skipped: true });
      return;
    }

    const email = String(req.body.email).trim().toLowerCase();
    const { firstName, lastName } = splitFullName(String(req.body.fullName));
    const gender = req.body.gender as 'male' | 'female';
    const relation =
      req.body.relation === 'other'
        ? String(req.body.relationOther ?? '').trim()
        : String(req.body.relation).trim();

    const other = await getUserByEmail(email);
    if (other && other.uid !== uid) {
      throw new AppError(ERROR_CODES.EMAIL_IN_USE, 'An account already exists with this email.');
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const avatarId = pickAvatarId(fullName, gender);
    const manualPhoto =
      typeof req.body.photoURL === 'string' && req.body.photoURL.startsWith('data:image/')
        ? String(req.body.photoURL)
        : null;

    await db.execute({
      sql: `UPDATE users SET
              first_name = ?,
              last_name = ?,
              email = ?,
              gender = ?,
              relation = ?,
              avatar_id = ?,
              photo_url = ?,
              photo_manual = ?,
              profile_setup_complete = 1,
              updated_at = ?
            WHERE uid = ?`,
      args: [
        firstName,
        lastName,
        email,
        gender,
        relation,
        avatarId,
        manualPhoto ?? avatarPath(avatarId),
        manualPhoto ? 1 : 0,
        now,
        uid,
      ],
    });

    // Keep accounts email in sync
    await db.execute({
      sql: 'UPDATE accounts SET email = ? WHERE uid = ?',
      args: [email, uid],
    });

    await writeAudit({ action: 'USER_UPDATED', performedBy: uid, targetUser: uid });
    res.json({ user: await getUserByUid(uid) });
  }),
);

/** Legacy password login (demo accounts still work). */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const validation = validateLogin(req.body.email ?? '', req.body.password ?? '');
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }
    const email = String(req.body.email).trim().toLowerCase();
    const account = await db.execute({
      sql: 'SELECT * FROM accounts WHERE email = ? LIMIT 1',
      args: [email],
    });
    const row = account.rows[0] as { uid: string; password_hash: string | null } | undefined;
    if (!row?.password_hash || !verifyPassword(req.body.password, row.password_hash)) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIAL, 'Invalid email or password.');
    }
    const profile = await getUserByUid(row.uid);
    if (!profile) throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User profile was not found.');
    res.json(await completeLogin(profile));
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  }),
);

authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const user = await getUserByEmail(email);
    if (user) {
      await db.execute({
        sql: `INSERT INTO password_resets (email, allowed, updated_at) VALUES (?, 1, ?)
              ON CONFLICT(email) DO UPDATE SET allowed = 1, updated_at = excluded.updated_at`,
        args: [email, nowIso()],
      });
    }
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/confirm-password-reset',
  asyncHandler(async (req, res) => {
    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password ?? '');
    const validation = validatePasswordReset(password, password);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }
    const reset = await db.execute({
      sql: 'SELECT allowed FROM password_resets WHERE email = ? LIMIT 1',
      args: [email],
    });
    if (!reset.rows[0] || Number(reset.rows[0].allowed) !== 1) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        'This reset link is invalid or has expired. Request a new one.',
      );
    }
    await db.batch(
      [
        {
          sql: 'UPDATE accounts SET password_hash = ? WHERE email = ?',
          args: [hashPassword(password), email],
        },
        {
          sql: 'DELETE FROM password_resets WHERE email = ?',
          args: [email],
        },
      ],
      'write',
    );
    res.json({ ok: true });
  }),
);
