import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { createFeedbackSubmission } from '../services/feedbackStore.ts';
import { serverLogger } from '../services/serverLogger.ts';

const router = Router();

const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'support', 'other']),
  message: z.string().trim().min(10, 'Please describe the issue or request in more detail.').max(2000),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid feedback payload.' });
    return;
  }

  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication is required.' });
    return;
  }

  const id = createFeedbackSubmission({
    userId: user.id,
    email: user.email,
    nickname: user.nickname,
    type: parsed.data.type,
    message: parsed.data.message,
  });

  serverLogger.info('feedback.created', {
    feedbackId: id,
    userId: user.id,
    type: parsed.data.type,
  });

  res.json({
    success: true,
    feedbackId: id,
    message: 'Feedback submitted. Our team will review it shortly.',
  });
});

export default router;
