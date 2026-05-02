import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { listFeedbackSubmissions, updateFeedbackSubmissionStatus } from '../services/feedbackStore.ts';
import {
  getAdminOverviewWithInsights,
  getAdminUserDetail,
  searchAdminUsers,
  updateAdminUserFlag,
} from '../services/adminInsights.ts';

const router = Router();

const ADMIN_MESSAGE_SEARCH_KEYWORD_REQUIRED = '请先输入搜索关键词。';
const ADMIN_MESSAGE_FEEDBACK_UPDATE_INVALID = '反馈状态更新请求无效。';
const ADMIN_MESSAGE_USER_SEARCH_INVALID = '用户搜索条件无效。';
const ADMIN_MESSAGE_USER_NOT_FOUND = '未找到该用户。';
const ADMIN_MESSAGE_USER_FLAG_INVALID = '用户标记更新请求无效。';

const feedbackStatusSchema = z.object({
  status: z.enum(['open', 'in_review', 'closed']),
});

const userSearchSchema = z.object({
  query: z.string().trim().min(1, ADMIN_MESSAGE_SEARCH_KEYWORD_REQUIRED).max(120),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const userFlagSchema = z.object({
  status: z.enum(['watch', 'restricted', 'cleared']),
  note: z.string().trim().max(400).optional(),
});

router.get('/overview', (_req: Request, res: Response) => {
  const feedback = listFeedbackSubmissions();
  res.json({
    ...getAdminOverviewWithInsights(),
    feedback,
    feedbackSummary: summarizeFeedback(feedback),
  });
});

router.get('/feedback', (_req: Request, res: Response) => {
  const feedback = listFeedbackSubmissions();
  res.json({
    feedback,
    feedbackSummary: summarizeFeedback(feedback),
  });
});

router.patch('/feedback/:id', (req: Request, res: Response) => {
  const parsed = feedbackStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || ADMIN_MESSAGE_FEEDBACK_UPDATE_INVALID });
    return;
  }

  updateFeedbackSubmissionStatus(readRouteParam(req.params.id), parsed.data.status);
  res.json({ success: true });
});

router.get('/users', (req: Request, res: Response) => {
  const parsed = userSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || ADMIN_MESSAGE_USER_SEARCH_INVALID });
    return;
  }

  res.json({
    users: searchAdminUsers(parsed.data.query, parsed.data.limit || 20),
  });
});

router.get('/users/:id', (req: Request, res: Response) => {
  const detail = getAdminUserDetail(readRouteParam(req.params.id));
  if (!detail) {
    res.status(404).json({ error: ADMIN_MESSAGE_USER_NOT_FOUND });
    return;
  }

  res.json(detail);
});

router.patch('/users/:id/flag', (req: Request, res: Response) => {
  const parsed = userFlagSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || ADMIN_MESSAGE_USER_FLAG_INVALID });
    return;
  }

  try {
    updateAdminUserFlag(readRouteParam(req.params.id), parsed.data.status, parsed.data.note || '');
    const detail = getAdminUserDetail(readRouteParam(req.params.id));
    res.json({
      success: true,
      user: detail?.user || null,
    });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : ADMIN_MESSAGE_USER_NOT_FOUND });
  }
});

function readRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

function summarizeFeedback(feedback: ReturnType<typeof listFeedbackSubmissions>) {
  return feedback.reduce(
    (summary, item) => {
      if (item.status === 'in_review') {
        summary.inReview += 1;
      } else if (item.status === 'closed') {
        summary.closed += 1;
      } else {
        summary.open += 1;
      }
      return summary;
    },
    { open: 0, inReview: 0, closed: 0 },
  );
}

export default router;
