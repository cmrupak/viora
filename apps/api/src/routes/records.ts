import { Router } from 'express';
import {
  AppError,
  DEFAULT_PAGE_SIZE,
  ERROR_CODES,
  paginate,
  validateRecord,
  type RecordItem,
} from '@viora/shared';
import { writeAudit } from '../auth.ts';
import { createId, db, nowIso } from '../db.ts';
import { asyncHandler, requireAdmin, requireAuth, type AuthedRequest } from '../middleware.ts';

export const recordsRouter = Router();

type DbRecord = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: 'active' | 'inactive';
  deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRecord(row: DbRecord): RecordItem {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    deleted: Boolean(row.deleted),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRecord(id: string): Promise<RecordItem | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM records WHERE id = ? LIMIT 1',
    args: [id],
  });
  const row = result.rows[0] as unknown as DbRecord | undefined;
  return row ? mapRecord(row) : null;
}

recordsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const validation = validateRecord(req.body);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }
    const id = createId('rec');
    const now = nowIso();
    await db.execute({
      sql: `INSERT INTO records (id, user_id, title, description, status, deleted, deleted_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      args: [id, req.user!.uid, req.body.title.trim(), req.body.description.trim(), req.body.status, now, now],
    });
    await writeAudit({ action: 'RECORD_CREATED', performedBy: req.user!.uid, targetRecord: id });
    res.status(201).json({ record: await getRecord(id) });
  }),
);

recordsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await listRecords(req, req.user!.uid));
  }),
);

recordsRouter.get(
  '/all',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    res.json(await listRecords(req));
  }),
);

recordsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const record = await getRecord(String(req.params.id));
    if (!record || record.deleted) throw new AppError(ERROR_CODES.NOT_FOUND, 'Record was not found.');
    if (record.userId !== req.user!.uid && req.user!.role !== 'admin') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'You cannot view this record.');
    }
    res.json({ record });
  }),
);

recordsRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const record = await getRecord(id);
    if (!record || record.deleted) throw new AppError(ERROR_CODES.NOT_FOUND, 'Record was not found.');
    if (record.userId !== req.user!.uid && req.user!.role !== 'admin') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'You cannot update this record.');
    }
    const validation = validateRecord(req.body);
    if (!validation.valid) {
      throw new AppError(ERROR_CODES.VALIDATION, 'Please fix the highlighted fields.', validation.errors);
    }
    await db.execute({
      sql: `UPDATE records SET title = ?, description = ?, status = ?, updated_at = ? WHERE id = ?`,
      args: [req.body.title.trim(), req.body.description.trim(), req.body.status, nowIso(), id],
    });
    await writeAudit({ action: 'RECORD_UPDATED', performedBy: req.user!.uid, targetRecord: id });
    res.json({ record: await getRecord(id) });
  }),
);

recordsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const record = await getRecord(id);
    if (!record || record.deleted) throw new AppError(ERROR_CODES.NOT_FOUND, 'Record was not found.');
    if (record.userId !== req.user!.uid && req.user!.role !== 'admin') {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'You cannot delete this record.');
    }
    const now = nowIso();
    await db.execute({
      sql: `UPDATE records SET deleted = 1, deleted_at = ?, updated_at = ? WHERE id = ?`,
      args: [now, now, id],
    });
    await writeAudit({ action: 'RECORD_DELETED', performedBy: req.user!.uid, targetRecord: id });
    res.json({ ok: true });
  }),
);

async function listRecords(req: AuthedRequest, userId?: string) {
  const search = String(req.query.search ?? '');
  const status = String(req.query.status ?? 'all');
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? DEFAULT_PAGE_SIZE);
  const sortBy = String(req.query.sortBy ?? 'createdAt');
  const sortDir = String(req.query.sortDir ?? 'desc') === 'asc' ? 1 : -1;

  const result = userId
    ? await db.execute({
        sql: 'SELECT * FROM records WHERE user_id = ?',
        args: [userId],
      })
    : await db.execute('SELECT * FROM records');

  let items = (result.rows as unknown as DbRecord[]).map(mapRecord).filter((item) => !item.deleted);
  if (status !== 'all') items = items.filter((item) => item.status === status);
  if (search.trim()) {
    const term = search.trim().toLowerCase();
    items = items.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(term));
  }
  items.sort((a, b) => {
    const left = String(a[sortBy as keyof RecordItem] ?? '');
    const right = String(b[sortBy as keyof RecordItem] ?? '');
    return left.localeCompare(right) * sortDir;
  });
  return paginate(items, page, pageSize);
}
