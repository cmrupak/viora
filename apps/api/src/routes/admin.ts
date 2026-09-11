import { Router } from 'express';
import {
  AppError,
  DEFAULT_PAGE_SIZE,
  ERROR_CODES,
  paginate,
  validateProfile,
  type UserRole,
} from '@viora/shared';
import { getUserByUid, mapUser, writeAudit, type DbUser } from '../auth.ts';
import { db, nowIso } from '../db.ts';
import { asyncHandler, requireAdmin, requireAuth, type AuthedRequest } from '../middleware.ts';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const search = String(req.query.search ?? '');
    const status = String(req.query.status ?? 'all');
    const role = String(req.query.role ?? 'all');
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? DEFAULT_PAGE_SIZE);

    const result = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
    let items = (result.rows as unknown as DbUser[]).map(mapUser);
    if (status !== 'all') items = items.filter((user) => user.status === status);
    if (role !== 'all') items = items.filter((user) => user.role === role);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      items = items.filter((user) =>
        `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase().includes(term),
      );
    }
    res.json(paginate(items, page, pageSize));
  }),
);

adminRouter.get(
  '/users/:uid',
  asyncHandler(async (req, res) => {
    const user = await getUserByUid(String(req.params.uid));
    if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'User was not found.');
    res.json({ user });
  }),
);

adminRouter.patch(
  '/users/:uid',
  asyncHandler(async (req: AuthedRequest, res) => {
    const uid = String(req.params.uid);
    const validation = validateProfile(req.body);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }
    const role = req.body.role as UserRole | undefined;
    if (role && uid === req.user!.uid) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'You cannot change your own role.');
    }

    const current = await getUserByUid(uid);
    if (!current) throw new AppError(ERROR_CODES.NOT_FOUND, 'User was not found.');

    const gender =
      req.body.gender === 'male' || req.body.gender === 'female' ? req.body.gender : current.gender;
    const relationRaw = typeof req.body.relation === 'string' ? req.body.relation.trim() : current.relation;
    const relation =
      relationRaw === 'other'
        ? String(req.body.relationOther ?? '').trim() || current.relation
        : relationRaw;

    await db.execute({
      sql: `UPDATE users SET first_name = ?, last_name = ?, gender = ?, relation = ?, role = COALESCE(?, role), updated_at = ? WHERE uid = ?`,
      args: [
        req.body.firstName.trim(),
        req.body.lastName.trim(),
        gender,
        relation,
        role ?? null,
        nowIso(),
        uid,
      ],
    });
    await writeAudit({ action: 'USER_UPDATED', performedBy: req.user!.uid, targetUser: uid });
    if (role) {
      await writeAudit({
        action: 'ROLE_CHANGED',
        performedBy: req.user!.uid,
        targetUser: uid,
        metadata: { role },
      });
    }
    res.json({ user: await getUserByUid(uid) });
  }),
);

adminRouter.post(
  '/users/:uid/activate',
  asyncHandler(async (req: AuthedRequest, res) => {
    const uid = String(req.params.uid);
    await db.execute({
      sql: `UPDATE users SET status = 'active', deactivated_at = NULL, updated_at = ? WHERE uid = ?`,
      args: [nowIso(), uid],
    });
    await writeAudit({ action: 'USER_ACTIVATED', performedBy: req.user!.uid, targetUser: uid });
    res.json({ user: await getUserByUid(uid) });
  }),
);

adminRouter.post(
  '/users/:uid/deactivate',
  asyncHandler(async (req: AuthedRequest, res) => {
    const uid = String(req.params.uid);
    if (uid === req.user!.uid) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'You cannot deactivate your own admin account here.');
    }
    const now = nowIso();
    await db.execute({
      sql: `UPDATE users SET status = 'inactive', deactivated_at = ?, updated_at = ? WHERE uid = ?`,
      args: [now, now, uid],
    });
    await writeAudit({ action: 'USER_DEACTIVATED', performedBy: req.user!.uid, targetUser: uid });
    res.json({ user: await getUserByUid(uid) });
  }),
);

adminRouter.post(
  '/users/:uid/role',
  asyncHandler(async (req: AuthedRequest, res) => {
    const uid = String(req.params.uid);
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    if (uid === req.user!.uid) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'You cannot change your own role.');
    }
    await db.execute({
      sql: `UPDATE users SET role = ?, updated_at = ? WHERE uid = ?`,
      args: [role, nowIso(), uid],
    });
    await writeAudit({
      action: 'ROLE_CHANGED',
      performedBy: req.user!.uid,
      targetUser: uid,
      metadata: { role },
    });
    res.json({ user: await getUserByUid(uid) });
  }),
);
