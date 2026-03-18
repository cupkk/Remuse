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
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid mailbox query.' });
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
