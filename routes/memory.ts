import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { queryUserMemories } from '../services/memoryRag.ts';
import { toClientAssetUrl } from '../services/storage.ts';

const router = Router();

const memoryMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
});

const memoryQuerySchema = z.object({
  query: z.string().trim().min(2, '请输入更具体一点的问题').max(300),
  history: z.array(memoryMessageSchema).max(12).optional(),
});

router.post('/query', async (req: Request, res: Response) => {
  try {
    const parsed = memoryQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body' });
      return;
    }

    const result = await queryUserMemories({
      userId: req.userId!,
      query: parsed.data.query,
      history: parsed.data.history?.map((message, index) => ({
        id: message.id || `${message.role}-${index}`,
        role: message.role,
        content: message.content,
      })),
    });

    res.json({
      ...result,
      matches: result.matches.map((match: typeof result.matches[number]) => ({
        ...match,
        imageUrl: toClientAssetUrl(match.imageUrl),
      })),
    });
  } catch (error) {
    console.error('Memory query failed:', error);
    res.status(500).json({ error: '记忆检索失败，请稍后重试' });
  }
});

export default router;
