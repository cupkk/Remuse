import { NextFunction, Request, Response } from 'express';
import { isAdminUser } from '../services/permissions.ts';

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdminUser(req.user)) {
    res.status(403).json({ error: 'Administrator access is required.' });
    return;
  }

  next();
}
