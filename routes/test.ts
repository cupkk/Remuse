import { Router } from 'express';
import { z } from 'zod';
import { clearTestMailbox, listTestMailboxEntries } from '../services/testMailbox.ts';

const router = Router();

const mailboxQuerySchema = z.object({
  email: z.string().trim().email().optional(),
  subject: z.string().trim().max(200).optional(),
});

router.get('/mailbox', (req, res) => {
  const parsed = mailboxQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '\u6d4b\u8bd5\u90ae\u7bb1\u67e5\u8be2\u53c2\u6570\u65e0\u6548\u3002' });
    return;
  }

  res.json({
    entries: listTestMailboxEntries(parsed.data),
  });
});

router.delete('/mailbox', (_req, res) => {
  clearTestMailbox();
  res.json({ success: true });
});

export default router;
