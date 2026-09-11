import type { NextFunction, Request, Response } from 'express';
import { AppError, ERROR_CODES, type UserProfile } from '@viora/shared';
import { getUserByUid, verifyToken } from './auth.ts';

export type AuthedRequest = Request & {
  user?: UserProfile;
};

export function asyncHandler(
  handler: (req: AuthedRequest, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req as AuthedRequest, res).catch(next);
  };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      res.status(401).json({ code: ERROR_CODES.UNAUTHENTICATED, message: 'Please sign in to continue.' });
      return;
    }
    const uid = await verifyToken(token);
    if (!uid) {
      res.status(401).json({ code: ERROR_CODES.UNAUTHENTICATED, message: 'Please sign in to continue.' });
      return;
    }
    const user = await getUserByUid(uid);
    if (!user) {
      res.status(401).json({ code: ERROR_CODES.UNAUTHENTICATED, message: 'Please sign in to continue.' });
      return;
    }
    if (user.status === 'inactive') {
      res.status(403).json({
        code: ERROR_CODES.ACCOUNT_INACTIVE,
        message: 'Your account has been deactivated. Please contact an administrator.',
      });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ code: ERROR_CODES.FORBIDDEN, message: 'You do not have access to this action.' });
    return;
  }
  next();
}

export function sendError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    const status =
      error.code === ERROR_CODES.UNAUTHENTICATED
        ? 401
        : error.code === ERROR_CODES.FORBIDDEN || error.code === ERROR_CODES.ACCOUNT_INACTIVE
          ? 403
          : error.code === ERROR_CODES.NOT_FOUND
            ? 404
            : error.code === ERROR_CODES.VALIDATION ||
                error.code === ERROR_CODES.EMAIL_IN_USE ||
                error.code === ERROR_CODES.INVALID_CREDENTIAL
              ? 400
              : 500;
    res.status(status).json({
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
    });
    return;
  }
  console.error(error);
  res.status(500).json({ code: ERROR_CODES.UNKNOWN, message: 'Something went wrong. Please try again.' });
}
