import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { createFeedbackSubmission } from '../services/feedbackStore.ts';
import { serverLogger } from '../services/serverLogger.ts';

const router = Router();

const feedbackSchema = z.object({
  type: z.enum(['bug', 'feature', 'support', 'other']),
  message: z.string().trim().min(10, '\u8bf7\u66f4\u8be6\u7ec6\u5730\u63cf\u8ff0\u4f60\u9047\u5230\u7684\u95ee\u9898\u6216\u9700\u6c42\u3002').max(2000),
});

router.post('/', (req: Request, res: Response) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '反馈参数无效。' });
    return;
  }

  const user = req.user;
  if (!user) {
    res.status(401).json({ error: '\u8bf7\u5148\u767b\u5f55\u540e\u518d\u63d0\u4ea4\u53cd\u9988\u3002' });
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
    message: '\u53cd\u9988\u5df2\u63d0\u4ea4\uff0c\u6211\u4eec\u4f1a\u5c3d\u5feb\u5904\u7406\u3002',
  });
});

export default router;
