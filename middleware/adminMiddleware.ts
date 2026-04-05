import { NextFunction, Request, Response } from 'express';
import { isAdminUser } from '../services/permissions.ts';

export function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !isAdminUser(req.user)) {
    res.status(403).json({ error: '\u4ec5\u9650\u7ba1\u7406\u5458\u8bbf\u95ee\u3002' });
    return;
  }

  next();
}
