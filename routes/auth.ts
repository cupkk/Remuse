import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, getRefreshTokenFromCookies } from '../middleware/authMiddleware.ts';
import {
  getRefreshTokenExpiresAt,
  hashPassword,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  comparePassword,
} from '../services/auth.ts';
import {
  createRefreshTokenSession,
  createUser,
  getRefreshTokenSession,
  getUserByEmail,
  getUserById,
  revokeRefreshTokenSession,
  updateUserPreferences,
  upgradeGuestUser,
} from '../services/database.ts';

const router = Router();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const emailSchema = z.string().trim().email('邮箱格式不正确');
const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, '密码至少 6 位'),
  nickname: z.string().trim().min(1).max(50).optional(),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '请输入密码'),
});
const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
}).optional();
const toolSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(50),
  iconType: z.enum(['scissors', 'tape', 'glue', 'screwdriver', 'brush', 'ruler', 'knife', 'other']),
  color: z.string().trim().min(1).max(32),
});
const preferencesSchema = z.object({
  onboardingSeen: z.boolean().optional(),
  sampleSeeded: z.boolean().optional(),
  toolbox: z.array(toolSchema).max(32).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: '至少提交一个可更新字段',
});

router.post('/guest', (_req: Request, res: Response) => {
  try {
    const id = uuidv4();
    const user = createUser({ id, nickname: '游客', is_guest: 1 });
    sendSessionResponse(res, user.id, user);
  } catch (error) {
    console.error('创建游客失败:', error);
    res.status(500).json({ error: '创建游客用户失败' });
  }
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效' });
      return;
    }

    const { email, password, nickname } = parsed.data;
    const existing = getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: '该邮箱已注册' });
      return;
    }

    const passwordHash = await hashPassword(password);
    let userId: string | null = null;

    const authorization = req.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = verifyToken(authorization.slice(7));
        if (payload.type === 'access') {
          const guest = getUserById(payload.sub);
          if (guest?.is_guest) {
            userId = guest.id;
          }
        }
      } catch {
        userId = null;
      }
    }

    const finalNickname = nickname || email.split('@')[0];
    const user = userId
      ? upgradeGuestUser(userId, { email, password_hash: passwordHash, nickname: finalNickname })
      : createUser({
          id: uuidv4(),
          email,
          password_hash: passwordHash,
          nickname: finalNickname,
          is_guest: 0,
        });

    sendSessionResponse(res, user.id, user);
  } catch (error) {
    console.error('注册失败:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效' });
      return;
    }

    const { email, password } = parsed.data;
    const user = getUserByEmail(email);
    if (!user || !user.password_hash) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    sendSessionResponse(res, user.id, user);
  } catch (error) {
    console.error('登录失败:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

router.post('/refresh', (req: Request, res: Response) => {
  try {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_missing', message: '缺少 refresh token' });
      return;
    }

    const payload = verifyToken(refreshToken);
    if (payload.type !== 'refresh' || !payload.jti) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_invalid', message: 'Refresh token 类型无效' });
      return;
    }

    const session = getRefreshTokenSession(payload.jti);
    if (
      !session ||
      session.user_id !== payload.sub ||
      session.revoked_at ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_invalid', message: 'Refresh token 无效，请重新登录' });
      return;
    }

    const user = getUserById(payload.sub);
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: '用户不存在' });
      return;
    }

    revokeRefreshTokenSession(session.id);
    const nextSession = issueSession(user.id);
    setRefreshCookie(res, nextSession.refreshToken);
    res.json({ accessToken: nextSession.accessToken });
  } catch (error: unknown) {
    clearRefreshCookie(res);
    const authError = error as { name?: string };
    if (authError.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'refresh_expired', message: 'Refresh token 已过期，请重新登录' });
      return;
    }

    res.status(401).json({ error: 'refresh_invalid', message: 'Refresh token 验证失败' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  const refreshToken = extractRefreshToken(req);

  if (refreshToken) {
    try {
      const payload = verifyToken(refreshToken);
      if (payload.type === 'refresh' && payload.jti) {
        revokeRefreshTokenSession(payload.jti);
      }
    } catch {
      // Logout is intentionally idempotent.
    }
  }

  clearRefreshCookie(res);
  res.json({ success: true });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  const user = getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

router.patch('/preferences', authMiddleware, (req: Request, res: Response) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效' });
    return;
  }

  const user = updateUserPreferences(req.userId!, parsed.data);
  if (!user) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

interface SanitizedUser {
  id: string;
  email: string | null;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: string;
  onboardingSeen: boolean;
  sampleSeeded: boolean;
  toolbox: Array<{
    id: string;
    name: string;
    iconType: 'scissors' | 'tape' | 'glue' | 'screwdriver' | 'brush' | 'ruler' | 'knife' | 'other';
    color: string;
  }>;
}

function sendSessionResponse(
  res: Response,
  userId: string,
  user: Parameters<typeof sanitizeUser>[0],
) {
  const session = issueSession(userId);
  setRefreshCookie(res, session.refreshToken);
  res.json({
    accessToken: session.accessToken,
    user: sanitizeUser(user),
  });
}

function issueSession(userId: string) {
  const refreshTokenId = uuidv4();
  createRefreshTokenSession({
    id: refreshTokenId,
    user_id: userId,
    expires_at: getRefreshTokenExpiresAt(),
  });

  return {
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId, refreshTokenId),
  };
}

function sanitizeUser(user: {
  id: string;
  email?: string | null;
  nickname: string;
  avatar_url?: string | null;
  is_guest: number | boolean;
  onboarding_seen?: number | boolean;
  sample_seeded?: number | boolean;
  toolbox_json?: string;
  created_at: string;
}): SanitizedUser {
  return {
    id: user.id,
    email: user.email || null,
    nickname: user.nickname,
    avatarUrl: user.avatar_url || null,
    isGuest: !!user.is_guest,
    createdAt: user.created_at,
    onboardingSeen: !!user.onboarding_seen,
    sampleSeeded: !!user.sample_seeded,
    toolbox: safeJsonParse(user.toolbox_json, []),
  };
}

function extractRefreshToken(req: Request): string | null {
  const cookieToken = getRefreshTokenFromCookies(req);
  if (cookieToken) {
    return cookieToken;
  }

  const parsedBody = refreshBodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return null;
  }

  return parsedBody.data?.refreshToken || null;
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/api',
    sameSite: 'lax',
    secure: IS_PRODUCTION,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    path: '/api',
    sameSite: 'lax',
    secure: IS_PRODUCTION,
  });
}

function safeJsonParse<T>(value: string | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export default router;
