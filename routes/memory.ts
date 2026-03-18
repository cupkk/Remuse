import { Request, Response, Router } from 'express';
import { z } from 'zod';
import {
  appendMemoryMessage,
  buildThreadTitle,
  createMemoryThread,
  deleteMemoryThread,
  ensureMemoryThread,
  getMemoryThreadSession,
  listMemoryThreadSummaries,
  renameMemoryThread,
  updateMemoryThreadContext,
} from '../services/memoryThreadStore.ts';
import { isAdminUserRestricted } from '../services/adminInsights.ts';
import { queryUserMemories } from '../services/memoryRag.ts';
import { toClientAssetUrl } from '../services/storage.ts';
import { assertWithinUsageQuota, recordAiUsageEvent, recordProductUsageEvent } from '../services/usageQuota.ts';

const router = Router();

function readRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

const memoryMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
});

const memoryQuerySchema = z.object({
  query: z.string().trim().min(2, 'Please enter a more specific memory prompt.').max(300),
  history: z.array(memoryMessageSchema).max(12).optional(),
});

const createThreadSchema = z.object({
  title: z.string().trim().max(80).optional(),
});

const renameThreadSchema = z.object({
  title: z.string().trim().min(1, 'Please provide a thread title.').max(80),
});

router.get('/threads', (req: Request, res: Response) => {
  const summaries = listMemoryThreadSummaries(req.userId!);
  res.json({ threads: summaries });
});

router.post('/threads', (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json({ error: 'This account is temporarily restricted from creating memory threads.' });
    return;
  }

  const parsed = createThreadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid thread payload.' });
    return;
  }

  const thread = createMemoryThread(req.userId!, parsed.data.title);
  recordProductUsageEvent({
    userId: req.userId!,
    eventType: 'memory_thread_create',
    details: {
      threadId: thread?.id,
    },
  });
  res.json({ thread: serializeThread(thread!) });
});

router.get('/threads/:id', (req: Request, res: Response) => {
  const thread = getMemoryThreadSession(req.userId!, readRouteParam(req.params.id));
  if (!thread) {
    res.status(404).json({ error: 'Memory thread not found.' });
    return;
  }

  res.json({ thread: serializeThread(thread) });
});

router.patch('/threads/:id', (req: Request, res: Response) => {
  const parsed = renameThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid thread update payload.' });
    return;
  }

  const thread = renameMemoryThread(req.userId!, readRouteParam(req.params.id), parsed.data.title);
  if (!thread) {
    res.status(404).json({ error: 'Memory thread not found.' });
    return;
  }

  res.json({ thread: serializeThread(thread) });
});

router.delete('/threads/:id', (req: Request, res: Response) => {
  const result = deleteMemoryThread(req.userId!, readRouteParam(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ error: 'Memory thread not found.' });
    return;
  }

  const remainingThreads = listMemoryThreadSummaries(req.userId!);
  const activeThread = ensureMemoryThread(req.userId!, remainingThreads[0]?.id);
  res.json({
    success: true,
    threads: remainingThreads,
    activeThread: activeThread ? serializeThread(activeThread) : null,
  });
});

router.post('/threads/:id/query', async (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json({ error: 'This account is temporarily restricted from memory queries.' });
    return;
  }

  const startedAt = Date.now();
  const quota = assertWithinUsageQuota(req.userId!, 'memory-query');
  if (!quota.allowed) {
    res.status(429).json({
      error: 'Daily memory query quota exceeded.',
      usage: quota,
    });
    return;
  }

  const parsed = memoryQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request body.' });
    return;
  }

  const thread = getMemoryThreadSession(req.userId!, readRouteParam(req.params.id));
  if (!thread) {
    res.status(404).json({ error: 'Memory thread not found.' });
    return;
  }

  const prompt = parsed.data.query.trim();
  const userMessage = {
    id: parsed.data.history?.slice(-1)[0]?.id ?? `user-${Date.now()}`,
    role: 'user' as const,
    content: prompt,
  };
  const nextHistory = [...thread.messages, userMessage];
  const nextTitle = buildThreadTitle(thread.title, nextHistory, prompt);

  appendMemoryMessage(thread.id, 'user', prompt);

  try {
    const result = await queryUserMemories({
      userId: req.userId!,
      query: prompt,
      history: nextHistory,
    });

    appendMemoryMessage(thread.id, 'assistant', result.answer);
    updateMemoryThreadContext(thread.id, {
      title: nextTitle,
      matches: result.matches,
      suggestions: result.suggestions,
      retrievalSummary: result.retrievalSummary,
      sourceCount: result.sourceCount,
      usedFallback: result.usedFallback,
    });

    recordAiUsageEvent({
      userId: req.userId!,
      scope: 'memory-query',
      model: 'memory-rag',
      success: true,
      durationMs: Date.now() - startedAt,
      details: {
        threadId: thread.id,
        matchCount: result.matches.length,
        usedFallback: result.usedFallback,
      },
    });
    recordProductUsageEvent({
      userId: req.userId!,
      eventType: 'memory_query',
      details: {
        threadId: thread.id,
        matchCount: result.matches.length,
      },
    });

    const updatedThread = getMemoryThreadSession(req.userId!, thread.id);
    res.json({
      thread: serializeThread(updatedThread!),
    });
  } catch (error) {
    recordAiUsageEvent({
      userId: req.userId!,
      scope: 'memory-query',
      model: 'memory-rag',
      success: false,
      durationMs: Date.now() - startedAt,
      details: {
        threadId: thread.id,
        error: error instanceof Error ? error.message : 'unknown',
      },
    });
    res.status(500).json({ error: 'Memory query failed.' });
  }
});

router.post('/query', async (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json({ error: 'This account is temporarily restricted from memory queries.' });
    return;
  }

  const startedAt = Date.now();
  const quota = assertWithinUsageQuota(req.userId!, 'memory-query');
  if (!quota.allowed) {
    res.status(429).json({
      error: 'Daily memory query quota exceeded.',
      usage: quota,
    });
    return;
  }

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

    recordAiUsageEvent({
      userId: req.userId!,
      scope: 'memory-query',
      model: 'memory-rag',
      success: true,
      durationMs: Date.now() - startedAt,
      details: {
        adHoc: true,
        matchCount: result.matches.length,
        usedFallback: result.usedFallback,
      },
    });
    recordProductUsageEvent({
      userId: req.userId!,
      eventType: 'memory_query',
      details: {
        adHoc: true,
        matchCount: result.matches.length,
      },
    });

    res.json({
      ...serializeMemoryResult(result),
    });
  } catch (error) {
    recordAiUsageEvent({
      userId: req.userId!,
      scope: 'memory-query',
      model: 'memory-rag',
      success: false,
      durationMs: Date.now() - startedAt,
      details: {
        adHoc: true,
        error: error instanceof Error ? error.message : 'unknown',
      },
    });
    res.status(500).json({ error: 'Memory query failed.' });
  }
});

function serializeThread(thread: NonNullable<ReturnType<typeof getMemoryThreadSession>>) {
  return {
    ...thread,
    matches: thread.matches.map((match) => ({
      ...match,
      imageUrl: toClientAssetUrl(match.imageUrl),
    })),
  };
}

function serializeMemoryResult(result: Awaited<ReturnType<typeof queryUserMemories>>) {
  return {
    ...result,
    matches: result.matches.map((match) => ({
      ...match,
      imageUrl: toClientAssetUrl(match.imageUrl),
    })),
  };
}

export default router;
