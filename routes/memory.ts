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

type MemoryStreamEvent =
  | { type: 'started'; threadId: string }
  | { type: 'delta'; delta: string }
  | { type: 'done'; thread: ReturnType<typeof serializeThread> }
  | { type: 'error'; error: string };

function readRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

function writeMemoryStreamEvent(res: Response, event: MemoryStreamEvent) {
  res.write(`${JSON.stringify(event)}\n`);
}

const memoryMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(2000),
});

const memoryQuerySchema = z.object({
  query: z.string().trim().min(2, '\u8bf7\u8f93\u5165\u66f4\u5177\u4f53\u7684\u8bb0\u5fc6\u63d0\u95ee\u3002').max(300),
  history: z.array(memoryMessageSchema).max(12).optional(),
});

const createThreadSchema = z.object({
  title: z.string().trim().max(80).optional(),
});

const renameThreadSchema = z.object({
  title: z.string().trim().min(1, '\u8bf7\u8f93\u5165\u4f1a\u8bdd\u6807\u9898\u3002').max(80),
});

router.get('/threads', (req: Request, res: Response) => {
  const summaries = listMemoryThreadSummaries(req.userId!);
  res.json({ threads: summaries });
});

router.post('/threads', (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json({ error: '\u5f53\u524d\u8d26\u53f7\u6682\u65f6\u65e0\u6cd5\u521b\u5efa\u8bb0\u5fc6\u4f1a\u8bdd\u3002' });
    return;
  }

  const parsed = createThreadSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '会话参数无效。' });
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
    res.status(404).json({ error: '\u8bb0\u5fc6\u4f1a\u8bdd\u4e0d\u5b58\u5728\u3002' });
    return;
  }

  res.json({ thread: serializeThread(thread) });
});

router.patch('/threads/:id', (req: Request, res: Response) => {
  const parsed = renameThreadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '会话更新参数无效。' });
    return;
  }

  const thread = renameMemoryThread(req.userId!, readRouteParam(req.params.id), parsed.data.title);
  if (!thread) {
    res.status(404).json({ error: '\u8bb0\u5fc6\u4f1a\u8bdd\u4e0d\u5b58\u5728\u3002' });
    return;
  }

  res.json({ thread: serializeThread(thread) });
});

router.delete('/threads/:id', (req: Request, res: Response) => {
  const result = deleteMemoryThread(req.userId!, readRouteParam(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ error: '\u8bb0\u5fc6\u4f1a\u8bdd\u4e0d\u5b58\u5728\u3002' });
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
    res.status(403).json({ error: '\u5f53\u524d\u8d26\u53f7\u6682\u65f6\u65e0\u6cd5\u4f7f\u7528\u8bb0\u5fc6\u68c0\u7d22\u3002' });
    return;
  }

  const startedAt = Date.now();
  const quota = assertWithinUsageQuota(req.userId!, 'stepfun-text');
  if (!quota.allowed) {
    res.status(429).json({
      error: '\u4eca\u65e5\u8bb0\u5fc6\u95ee\u7b54\u989d\u5ea6\u5df2\u7528\u5b8c\u3002',
      usage: quota,
    });
    return;
  }

  const parsed = memoryQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
    return;
  }

  const thread = getMemoryThreadSession(req.userId!, readRouteParam(req.params.id));
  if (!thread) {
    res.status(404).json({ error: '\u8bb0\u5fc6\u4f1a\u8bdd\u4e0d\u5b58\u5728\u3002' });
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
      scope: 'stepfun-text',
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
      scope: 'stepfun-text',
      model: 'memory-rag',
      success: false,
      durationMs: Date.now() - startedAt,
      details: {
        threadId: thread.id,
        error: error instanceof Error ? error.message : 'unknown',
      },
    });
    res.status(500).json({ error: '\u8bb0\u5fc6\u68c0\u7d22\u5931\u8d25\u3002' });
  }
});

router.post('/threads/:id/query/stream', async (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json({ error: '\u5f53\u524d\u8d26\u53f7\u6682\u65f6\u65e0\u6cd5\u4f7f\u7528\u8bb0\u5fc6\u68c0\u7d22\u3002' });
    return;
  }

  const startedAt = Date.now();
  const quota = assertWithinUsageQuota(req.userId!, 'stepfun-text');
  if (!quota.allowed) {
    res.status(429).json({
      error: '\u4eca\u65e5\u8bb0\u5fc6\u95ee\u7b54\u989d\u5ea6\u5df2\u7528\u5b8c\u3002',
      usage: quota,
    });
    return;
  }

  const parsed = memoryQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
    return;
  }

  const thread = getMemoryThreadSession(req.userId!, readRouteParam(req.params.id));
  if (!thread) {
    res.status(404).json({ error: '\u8bb0\u5fc6\u4f1a\u8bdd\u4e0d\u5b58\u5728\u3002' });
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
  const abortController = new AbortController();
  let streamClosed = false;

  req.on('close', () => {
    if (!streamClosed) {
      streamClosed = true;
      abortController.abort();
    }
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  appendMemoryMessage(thread.id, 'user', prompt);
  writeMemoryStreamEvent(res, {
    type: 'started',
    threadId: thread.id,
  });

  try {
    const result = await queryUserMemories({
      userId: req.userId!,
      query: prompt,
      history: nextHistory,
      signal: abortController.signal,
      onDelta: async (delta) => {
        if (!delta || streamClosed) {
          return;
        }

        writeMemoryStreamEvent(res, {
          type: 'delta',
          delta,
        });
      },
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
      scope: 'stepfun-text',
      model: 'memory-rag',
      success: true,
      durationMs: Date.now() - startedAt,
      details: {
        threadId: thread.id,
        matchCount: result.matches.length,
        usedFallback: result.usedFallback,
        streamed: true,
      },
    });
    recordProductUsageEvent({
      userId: req.userId!,
      eventType: 'memory_query',
      details: {
        threadId: thread.id,
        matchCount: result.matches.length,
        streamed: true,
      },
    });

    const updatedThread = getMemoryThreadSession(req.userId!, thread.id);
    if (updatedThread && !streamClosed) {
      writeMemoryStreamEvent(res, {
        type: 'done',
        thread: serializeThread(updatedThread),
      });
    }
  } catch (error) {
    const aborted = abortController.signal.aborted;
    recordAiUsageEvent({
      userId: req.userId!,
      scope: 'stepfun-text',
      model: 'memory-rag',
      success: false,
      durationMs: Date.now() - startedAt,
      details: {
        threadId: thread.id,
        streamed: true,
        aborted,
        error: error instanceof Error ? error.message : 'unknown',
      },
    });

    if (!streamClosed && !aborted) {
      writeMemoryStreamEvent(res, {
        type: 'error',
        error: '记忆检索失败。',
      });
    }
  } finally {
    streamClosed = true;
    res.end();
  }
});

router.post('/query', async (req: Request, res: Response) => {
  if (isAdminUserRestricted(req.userId!)) {
    res.status(403).json({ error: '\u5f53\u524d\u8d26\u53f7\u6682\u65f6\u65e0\u6cd5\u4f7f\u7528\u8bb0\u5fc6\u68c0\u7d22\u3002' });
    return;
  }

  const startedAt = Date.now();
  const quota = assertWithinUsageQuota(req.userId!, 'stepfun-text');
  if (!quota.allowed) {
    res.status(429).json({
      error: '\u4eca\u65e5\u8bb0\u5fc6\u95ee\u7b54\u989d\u5ea6\u5df2\u7528\u5b8c\u3002',
      usage: quota,
    });
    return;
  }

  try {
    const parsed = memoryQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求体参数无效。' });
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
      scope: 'stepfun-text',
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
      scope: 'stepfun-text',
      model: 'memory-rag',
      success: false,
      durationMs: Date.now() - startedAt,
      details: {
        adHoc: true,
        error: error instanceof Error ? error.message : 'unknown',
      },
    });
    res.status(500).json({ error: '\u8bb0\u5fc6\u68c0\u7d22\u5931\u8d25\u3002' });
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
