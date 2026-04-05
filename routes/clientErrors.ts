import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { optionalAuth } from '../middleware/authMiddleware.ts';
import { serverLogger } from '../services/serverLogger.ts';

const router = Router();

const clientErrorSchema = z.object({
  source: z.enum(['error-boundary', 'window.error', 'unhandledrejection', 'manual']),
  message: z.string().trim().min(1).max(2000),
  stack: z.string().max(12000).nullable().optional(),
  componentStack: z.string().max(12000).nullable().optional(),
  href: z.string().url().max(2000).optional(),
  userAgent: z.string().max(2000).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

router.post('/', optionalAuth, (req: Request, res: Response) => {
  const parsed = clientErrorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '客户端错误上报参数无效。' });
    return;
  }

  const payload = parsed.data;
  serverLogger.error('client.error', {
    userId: req.userId || null,
    source: payload.source,
    message: payload.message,
    stack: payload.stack || null,
    componentStack: payload.componentStack || null,
    href: payload.href || null,
    userAgent: payload.userAgent || null,
    extra: payload.extra || {},
  });

  res.status(202).json({ accepted: true });
});

export default router;
