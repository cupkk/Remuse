import { Request, Response, Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, getRefreshTokenFromCookies } from '../middleware/authMiddleware.ts';
import {
  comparePassword,
  getRefreshTokenExpiresAt,
  hashPassword,
  normalizeEmailAddress,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_MS,
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from '../services/auth.ts';
import {
  createRefreshTokenSession,
  createUser,
  getRefreshTokenSession,
  getUserByEmail,
  getUserById,
  revokeRefreshTokenSession,
  revokeRefreshTokenSessionsForUser,
  updateUserPassword,
  updateUserPreferences,
  upgradeGuestUser,
} from '../services/database.ts';
import {
  isEmailVerified,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from '../services/authLifecycleStore.ts';
import {
  MailDispatchResult,
  isLiveMailDeliveryEnabled,
  resolveAppBaseUrl,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../services/mailer.ts';
import { LEGAL_VERSION_SNAPSHOT } from '../services/legalDocuments.ts';
import { resolveUserRole } from '../services/permissions.ts';
import { serverLogger } from '../services/serverLogger.ts';
import { deleteUserAccount, recordUserConsents } from '../services/userGovernance.ts';
import { getUsageSnapshotForUser, recordProductUsageEvent } from '../services/usageQuota.ts';

const router = Router();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
type UserRecord = NonNullable<ReturnType<typeof getUserById>>;

const AUTH_MESSAGE_AUTH_ATTEMPT_LIMIT = '\u767b\u5f55\u6216\u6ce8\u518c\u5c1d\u8bd5\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const AUTH_MESSAGE_GUEST_LIMIT = '\u6e38\u5ba2\u4f1a\u8bdd\u521b\u5efa\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const AUTH_MESSAGE_SESSION_LIMIT = '\u8ba4\u8bc1\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const AUTH_MESSAGE_MAIL_LIMIT = '\u90ae\u4ef6\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const AUTH_MESSAGE_RECOVERY_LIMIT = '\u8d26\u53f7\u6062\u590d\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const AUTH_MESSAGE_INVALID_BODY = '\u8bf7\u6c42\u53c2\u6570\u65e0\u6548\u3002';
const AUTH_MESSAGE_USER_NOT_FOUND = '\u672a\u627e\u5230\u8be5\u7528\u6237\u3002';
const AUTH_MESSAGE_REGISTER_FAILED = '\u6ce8\u518c\u5931\u8d25\u3002';
const AUTH_MESSAGE_LOGIN_FAILED = '\u767b\u5f55\u5931\u8d25\u3002';
const AUTH_MESSAGE_FORGOT_PASSWORD_SENT = '\u5982\u679c\u8be5\u90ae\u7bb1\u5df2\u6ce8\u518c\uff0c\u6211\u4eec\u5df2\u5411\u4f60\u53d1\u9001\u91cd\u7f6e\u5bc6\u7801\u94fe\u63a5\u3002';
const AUTH_MESSAGE_GUEST_VERIFY_UPGRADE = '\u8bf7\u5148\u5c06\u6e38\u5ba2\u8d26\u53f7\u5347\u7ea7\u4e3a\u6b63\u5f0f\u8d26\u53f7\uff0c\u518d\u9a8c\u8bc1\u90ae\u7bb1\u3002';
const AUTH_MESSAGE_EMAIL_ALREADY_VERIFIED = '\u8be5\u90ae\u7bb1\u5df2\u5b8c\u6210\u9a8c\u8bc1\u3002';
const AUTH_MESSAGE_VERIFICATION_SENT = '\u9a8c\u8bc1\u90ae\u4ef6\u5df2\u53d1\u9001\u3002';
const AUTH_MESSAGE_VERIFICATION_SEND_FAILED = '\u5f53\u524d\u6682\u65f6\u65e0\u6cd5\u53d1\u9001\u9a8c\u8bc1\u90ae\u4ef6\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const AUTH_MESSAGE_VERIFICATION_EXPIRED = '\u9a8c\u8bc1\u94fe\u63a5\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u53d1\u9001\u9a8c\u8bc1\u90ae\u4ef6\u3002';
const AUTH_MESSAGE_VERIFICATION_INVALID = '\u9a8c\u8bc1\u94fe\u63a5\u65e0\u6548\u3002';
const AUTH_MESSAGE_VERIFICATION_SUCCESS = '\u90ae\u7bb1\u9a8c\u8bc1\u6210\u529f\u3002';
const AUTH_MESSAGE_RESET_LINK_EXPIRED = '\u91cd\u7f6e\u5bc6\u7801\u94fe\u63a5\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u7533\u8bf7\u3002';
const AUTH_MESSAGE_RESET_LINK_INVALID = '\u91cd\u7f6e\u5bc6\u7801\u94fe\u63a5\u65e0\u6548\u3002';
const AUTH_MESSAGE_RESET_SUCCESS = '\u5bc6\u7801\u91cd\u7f6e\u6210\u529f\u3002';
const AUTH_MESSAGE_RESET_FAILED = '\u5bc6\u7801\u91cd\u7f6e\u5931\u8d25\u3002';
const AUTH_MESSAGE_REFRESH_MISSING = '\u7f3a\u5c11\u5237\u65b0\u4ee4\u724c\u3002';
const AUTH_MESSAGE_REFRESH_TYPE_INVALID = '\u5237\u65b0\u4ee4\u724c\u7c7b\u578b\u65e0\u6548\u3002';
const AUTH_MESSAGE_REFRESH_INVALID = '\u5237\u65b0\u4ee4\u724c\u65e0\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002';
const AUTH_MESSAGE_REFRESH_EXPIRED = '\u5237\u65b0\u4ee4\u724c\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002';
const AUTH_MESSAGE_REFRESH_VERIFY_FAILED = '\u5237\u65b0\u4ee4\u724c\u9a8c\u8bc1\u5931\u8d25\u3002';
const AUTH_MESSAGE_GUEST_CHANGE_PASSWORD = '\u8bf7\u5148\u5c06\u6e38\u5ba2\u8d26\u53f7\u5347\u7ea7\u4e3a\u6b63\u5f0f\u8d26\u53f7\uff0c\u518d\u4fee\u6539\u5bc6\u7801\u3002';
const AUTH_MESSAGE_CURRENT_PASSWORD_INCORRECT = '\u5f53\u524d\u5bc6\u7801\u4e0d\u6b63\u786e\u3002';
const AUTH_MESSAGE_PASSWORD_CHANGE_FAILED = '\u4fee\u6539\u5bc6\u7801\u5931\u8d25\u3002';
const AUTH_MESSAGE_SESSION_UNAVAILABLE = '\u5f53\u524d\u4f1a\u8bdd\u4e0d\u53ef\u7528\u3002';
const AUTH_MESSAGE_SESSION_INVALID = '\u5f53\u524d\u4f1a\u8bdd\u5df2\u5931\u6548\u3002';
const AUTH_MESSAGE_DELETE_REQUIRES_PASSWORD_RESET = '\u8be5\u8d26\u53f7\u9700\u5148\u91cd\u7f6e\u5bc6\u7801\uff0c\u624d\u80fd\u6267\u884c\u6ce8\u9500\u3002';
const AUTH_MESSAGE_DELETE_PASSWORD_REQUIRED = '\u8bf7\u8f93\u5165\u5f53\u524d\u5bc6\u7801\u4ee5\u6ce8\u9500\u8d26\u53f7\u3002';
const AUTH_MESSAGE_PASSWORD_RESET_UNAVAILABLE = '\u5f53\u524d\u5bc6\u7801\u627e\u56de\u529f\u80fd\u6682\u4e0d\u53ef\u7528\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u5904\u7406\u3002';

const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authIdentityKeyGenerator,
  message: { error: AUTH_MESSAGE_AUTH_ATTEMPT_LIMIT },
});

const guestBootstrapLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: AUTH_MESSAGE_GUEST_LIMIT },
});

const authSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: AUTH_MESSAGE_SESSION_LIMIT },
});

const authMailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authIdentityKeyGenerator,
  message: { error: AUTH_MESSAGE_MAIL_LIMIT },
});

const authRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: AUTH_MESSAGE_RECOVERY_LIMIT },
});

const emailSchema = z.string().trim().email('\u8bf7\u8f93\u5165\u6709\u6548\u7684\u90ae\u7bb1\u5730\u5740\u3002');
const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, '\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d\u3002'),
  nickname: z.string().trim().min(1).max(50).optional(),
  acceptPolicies: z.boolean().refine(Boolean, {
    message: '\u6ce8\u518c\u524d\u9700\u540c\u610f\u7528\u6237\u534f\u8bae\u3001\u9690\u79c1\u653f\u7b56\u4e0e AI \u751f\u6210\u8bf4\u660e\u3002',
  }),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, '\u8bf7\u8f93\u5165\u5bc6\u7801\u3002'),
});
const forgotPasswordSchema = z.object({
  email: emailSchema,
});
const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, '\u9a8c\u8bc1\u4ee4\u724c\u4e0d\u80fd\u4e3a\u7a7a\u3002'),
});
const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, '\u91cd\u7f6e\u4ee4\u724c\u4e0d\u80fd\u4e3a\u7a7a\u3002'),
  newPassword: z.string().min(6, '\u65b0\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d\u3002'),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '\u8bf7\u8f93\u5165\u5f53\u524d\u5bc6\u7801\u3002'),
  newPassword: z.string().min(6, '\u65b0\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4f4d\u3002'),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: '\u65b0\u5bc6\u7801\u4e0d\u80fd\u4e0e\u5f53\u524d\u5bc6\u7801\u76f8\u540c\u3002',
  path: ['newPassword'],
});
const deleteAccountSchema = z.object({
  password: z.string().optional(),
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
  toolbox: z.array(toolSchema).max(32).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: '\u81f3\u5c11\u9700\u8981\u63d0\u4ea4\u4e00\u9879\u504f\u597d\u8bbe\u7f6e\u3002',
});

router.use((_req: Request, res: Response, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.post('/guest', guestBootstrapLimiter, (_req: Request, res: Response) => {
  try {
    const id = uuidv4();
    const user = createUser({ id, nickname: 'Guest', is_guest: 1 });
    recordProductUsageEvent({
      userId: user.id,
      eventType: 'guest_bootstrap',
    });
    sendSessionResponse(res, user.id, user);
  } catch (error) {
    res.status(500).json({ error: '\u521b\u5efa\u6e38\u5ba2\u8d26\u53f7\u5931\u8d25\u3002' });
  }
});

router.post('/register', authAttemptLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
      return;
    }

    const email = normalizeEmailAddress(parsed.data.email);
    const { password, nickname } = parsed.data;
    const existing = getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: '\u8be5\u90ae\u7bb1\u5df2\u88ab\u6ce8\u518c\u3002' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const guestUser = resolveGuestUpgradeCandidate(req);
    const finalNickname = nickname || email.split('@')[0];
    const user = guestUser
      ? upgradeGuestUser(guestUser.id, {
          email,
          password_hash: passwordHash,
          nickname: finalNickname,
        })
      : createUser({
          id: uuidv4(),
          email,
          password_hash: passwordHash,
          nickname: finalNickname,
          is_guest: 0,
        });

    recordUserConsents(user.id);
    recordProductUsageEvent({
      userId: user.id,
      eventType: 'register_success',
      details: {
        upgradedGuest: !!guestUser,
      },
    });

    let emailDelivery: MailDispatchResult | undefined;
    try {
      emailDelivery = await dispatchEmailVerification(req, user);
    } catch {
      // Keep registration successful even if mail delivery is temporarily unavailable.
    }

    sendSessionResponse(res, user.id, user, {
      emailVerificationRequired: !isEmailVerified(user),
      emailDelivery,
    });
  } catch {
    res.status(500).json({ error: AUTH_MESSAGE_REGISTER_FAILED });
  }
});

router.post('/login', authAttemptLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
      return;
    }

    const email = normalizeEmailAddress(parsed.data.email);
    const { password } = parsed.data;
    const user = getUserByEmail(email);
    if (!user) {
      serverLogger.warn('auth.login_rejected', {
        reason: 'user_not_found',
        email: maskEmail(email),
        ip: getRequestIp(req),
      });
      res.status(401).json({ error: '\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002' });
      return;
    }

    if (!user.password_hash) {
      serverLogger.warn('auth.login_rejected', {
        reason: 'password_hash_missing',
        userId: user.id,
        email: maskEmail(email),
        ip: getRequestIp(req),
      });
      res.status(401).json({ error: '\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002' });
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      serverLogger.warn('auth.login_rejected', {
        reason: 'password_mismatch',
        userId: user.id,
        email: maskEmail(email),
        ip: getRequestIp(req),
      });
      res.status(401).json({ error: '\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002' });
      return;
    }

    recordProductUsageEvent({
      userId: user.id,
      eventType: 'login_success',
    });
    sendSessionResponse(res, user.id, user);
  } catch {
    res.status(500).json({ error: AUTH_MESSAGE_LOGIN_FAILED });
  }
});

router.post('/forgot-password', authMailLimiter, async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
    return;
  }

  if (IS_PRODUCTION && !isLiveMailDeliveryEnabled()) {
    serverLogger.error('auth.password_reset_unavailable', {
      reason: 'mail_delivery_disabled',
      ip: getRequestIp(req),
    });
    res.status(503).json({ error: AUTH_MESSAGE_PASSWORD_RESET_UNAVAILABLE });
    return;
  }

  const email = normalizeEmailAddress(parsed.data.email);
  const user = getUserByEmail(email);

  if (user && !user.is_guest && user.email) {
    try {
      await dispatchPasswordReset(req, user);
    } catch {
      // Prevent account enumeration and keep response consistent.
    }
  }

  res.json({
    success: true,
    message: AUTH_MESSAGE_FORGOT_PASSWORD_SENT,
  });
});

router.post('/send-verification', authMailLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: '未找到该用户。' });
      return;
    }

    if (user.is_guest || !user.email) {
      res.status(403).json({ error: AUTH_MESSAGE_GUEST_VERIFY_UPGRADE });
      return;
    }

    if (isEmailVerified(user)) {
      res.status(409).json({ error: AUTH_MESSAGE_EMAIL_ALREADY_VERIFIED });
      return;
    }

    const emailDelivery = await dispatchEmailVerification(req, user);
    res.json({
      success: true,
      message: AUTH_MESSAGE_VERIFICATION_SENT,
      emailDelivery,
    });
  } catch {
    res.status(503).json({ error: AUTH_MESSAGE_VERIFICATION_SEND_FAILED });
  }
});

router.post('/verify-email', authRecoveryLimiter, async (req: Request, res: Response) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
    return;
  }

  const result = verifyEmailWithToken(parsed.data.token);
  if (result.status !== 'ok') {
    res.status(result.status === 'expired' ? 410 : 400).json({
      error:
        result.status === 'expired'
          ? AUTH_MESSAGE_VERIFICATION_EXPIRED
          : AUTH_MESSAGE_VERIFICATION_INVALID,
    });
    return;
  }

  recordProductUsageEvent({
    userId: result.user.id,
    eventType: 'email_verify_success',
    details: {
      email: result.user.email,
    },
  });

  res.json({
    success: true,
    message: AUTH_MESSAGE_VERIFICATION_SUCCESS,
    user: sanitizeUser(result.user),
  });
});

router.post('/reset-password', authRecoveryLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const result = resetPasswordWithToken(parsed.data.token, passwordHash);
    if (result.status !== 'ok') {
      res.status(result.status === 'expired' ? 410 : 400).json({
        error:
          result.status === 'expired'
            ? AUTH_MESSAGE_RESET_LINK_EXPIRED
            : AUTH_MESSAGE_RESET_LINK_INVALID,
      });
      return;
    }

    revokeRefreshTokenSessionsForUser(result.user.id);
    sendSessionResponse(res, result.user.id, result.user, {
      message: AUTH_MESSAGE_RESET_SUCCESS,
    });
  } catch {
    res.status(500).json({ error: AUTH_MESSAGE_RESET_FAILED });
  }
});

router.post('/refresh', authSessionLimiter, (req: Request, res: Response) => {
  try {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_missing', message: AUTH_MESSAGE_REFRESH_MISSING });
      return;
    }

    const payload = verifyToken(refreshToken);
    if (payload.type !== 'refresh' || !payload.jti) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_invalid', message: AUTH_MESSAGE_REFRESH_TYPE_INVALID });
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
      res.status(401).json({ error: 'refresh_invalid', message: AUTH_MESSAGE_REFRESH_INVALID });
      return;
    }

    const user = getUserById(payload.sub);
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: '未找到该用户。' });
      return;
    }

    revokeRefreshTokenSession(session.id);
    const nextSession = issueSession(user.id);
    recordProductUsageEvent({
      userId: user.id,
      eventType: 'session_refresh',
    });
    setRefreshCookie(res, nextSession.refreshToken);
    res.json({ accessToken: nextSession.accessToken });
  } catch (error: unknown) {
    clearRefreshCookie(res);
    const authError = error as { name?: string };
    if (authError.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'refresh_expired', message: AUTH_MESSAGE_REFRESH_EXPIRED });
      return;
    }

    res.status(401).json({ error: 'refresh_invalid', message: AUTH_MESSAGE_REFRESH_VERIFY_FAILED });
  }
});

router.post('/logout', authSessionLimiter, (req: Request, res: Response) => {
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

router.get('/me', authSessionLimiter, authMiddleware, (req: Request, res: Response) => {
  const user = getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: '未找到该用户。' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

router.patch('/preferences', authSessionLimiter, authMiddleware, (req: Request, res: Response) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
    return;
  }

  const user = updateUserPreferences(req.userId!, parsed.data);
  if (!user) {
    res.status(404).json({ error: '未找到该用户。' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

router.post('/change-password', authSessionLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
      return;
    }

    const user = getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: '未找到该用户。' });
      return;
    }

    if (user.is_guest || !user.password_hash) {
      res.status(403).json({ error: AUTH_MESSAGE_GUEST_CHANGE_PASSWORD });
      return;
    }

    const passwordMatches = await comparePassword(parsed.data.currentPassword, user.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: AUTH_MESSAGE_CURRENT_PASSWORD_INCORRECT });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const updatedUser = updateUserPassword(user.id, passwordHash);
    if (!updatedUser) {
      res.status(404).json({ error: '未找到该用户。' });
      return;
    }

    revokeRefreshTokenSessionsForUser(user.id);
    sendSessionResponse(res, updatedUser.id, updatedUser);
  } catch {
    res.status(500).json({ error: AUTH_MESSAGE_PASSWORD_CHANGE_FAILED });
  }
});

router.post('/logout-others', authSessionLimiter, authMiddleware, (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenFromCookies(req);
  if (!refreshToken) {
    res.status(400).json({ error: AUTH_MESSAGE_SESSION_UNAVAILABLE });
    return;
  }

  try {
    const payload = verifyToken(refreshToken);
    if (payload.type !== 'refresh' || !payload.jti) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_invalid', message: AUTH_MESSAGE_SESSION_INVALID });
      return;
    }

    const session = getRefreshTokenSession(payload.jti);
    if (
      !session ||
      session.user_id !== req.userId ||
      session.revoked_at ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_invalid', message: AUTH_MESSAGE_SESSION_INVALID });
      return;
    }

    revokeRefreshTokenSessionsForUser(req.userId!, payload.jti);
    res.json({ success: true });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'refresh_invalid', message: AUTH_MESSAGE_SESSION_INVALID });
  }
});

router.post('/delete-account', authSessionLimiter, authMiddleware, async (req: Request, res: Response) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || '请求参数无效。' });
    return;
  }

  const user = getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: '未找到该用户。' });
    return;
  }

  if (!user.is_guest) {
    if (!user.password_hash) {
      res.status(403).json({ error: AUTH_MESSAGE_DELETE_REQUIRES_PASSWORD_RESET });
      return;
    }

    if (!parsed.data.password) {
      res.status(400).json({ error: AUTH_MESSAGE_DELETE_PASSWORD_REQUIRED });
      return;
    }

    const passwordMatches = await comparePassword(parsed.data.password, user.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: AUTH_MESSAGE_CURRENT_PASSWORD_INCORRECT });
      return;
    }
  }

  revokeRefreshTokenSessionsForUser(user.id);
  deleteUserAccount(user.id);
  clearRefreshCookie(res);
  res.json({ success: true });
});

interface SanitizedUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  nickname: string;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: string;
  onboardingSeen: boolean;
  toolbox: Array<{
    id: string;
    name: string;
    iconType: 'scissors' | 'tape' | 'glue' | 'screwdriver' | 'brush' | 'ruler' | 'knife' | 'other';
    color: string;
  }>;
  role: 'admin' | 'user';
  isAdmin: boolean;
  agreements: {
    termsVersionAccepted: string | null;
    privacyVersionAccepted: string | null;
    aiNoticeVersionAccepted: string | null;
    consentAcceptedAt: string | null;
    currentTermsVersion: string;
    currentPrivacyVersion: string;
    currentAiNoticeVersion: string;
  };
  usage: ReturnType<typeof getUsageSnapshotForUser>;
}

function sendSessionResponse(
  res: Response,
  userId: string,
  user: Parameters<typeof sanitizeUser>[0],
  extra: Record<string, unknown> = {},
) {
  const session = issueSession(userId);
  setRefreshCookie(res, session.refreshToken);
  res.json({
    accessToken: session.accessToken,
    user: sanitizeUser(user),
    ...extra,
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
  email_verified?: number | boolean;
  nickname: string;
  avatar_url?: string | null;
  is_guest: number | boolean;
  onboarding_seen?: number | boolean;
  toolbox_json?: string;
  role?: string | null;
  terms_accepted_version?: string | null;
  privacy_accepted_version?: string | null;
  ai_notice_accepted_version?: string | null;
  consent_accepted_at?: string | null;
  created_at: string;
}): SanitizedUser {
  const role = resolveUserRole(user);
  return {
    id: user.id,
    email: user.email || null,
    emailVerified: !!user.email_verified,
    nickname: user.nickname,
    avatarUrl: user.avatar_url || null,
    isGuest: !!user.is_guest,
    createdAt: user.created_at,
    onboardingSeen: !!user.onboarding_seen,
    toolbox: safeJsonParse(user.toolbox_json, []),
    role,
    isAdmin: role === 'admin',
    agreements: {
      termsVersionAccepted: user.terms_accepted_version || null,
      privacyVersionAccepted: user.privacy_accepted_version || null,
      aiNoticeVersionAccepted: user.ai_notice_accepted_version || null,
      consentAcceptedAt: user.consent_accepted_at || null,
      currentTermsVersion: LEGAL_VERSION_SNAPSHOT.terms,
      currentPrivacyVersion: LEGAL_VERSION_SNAPSHOT.privacy,
      currentAiNoticeVersion: LEGAL_VERSION_SNAPSHOT.ai,
    },
    usage: getUsageSnapshotForUser(user.id),
  };
}

function resolveGuestUpgradeCandidate(req: Request): UserRecord | null {
  const accessToken = getBearerToken(req.headers.authorization);
  if (accessToken) {
    const guestFromAccessToken = resolveGuestFromAccessToken(accessToken);
    if (guestFromAccessToken) {
      return guestFromAccessToken;
    }
  }

  const refreshToken = getRefreshTokenFromCookies(req);
  if (!refreshToken) {
    return null;
  }

  return resolveGuestFromRefreshToken(refreshToken);
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

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.slice(7).trim();
  return token || null;
}

function resolveGuestFromAccessToken(token: string): UserRecord | null {
  try {
    const payload = verifyToken(token);
    if (payload.type !== 'access') {
      return null;
    }

    const user = getUserById(payload.sub);
    return user?.is_guest ? (user as UserRecord) : null;
  } catch {
    return null;
  }
}

function resolveGuestFromRefreshToken(token: string): UserRecord | null {
  try {
    const payload = verifyToken(token);
    if (payload.type !== 'refresh' || !payload.jti) {
      return null;
    }

    const session = getRefreshTokenSession(payload.jti);
    if (
      !session ||
      session.user_id !== payload.sub ||
      session.revoked_at ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return null;
    }

    const user = getUserById(payload.sub);
    return user?.is_guest ? (user as UserRecord) : null;
  } catch {
    return null;
  }
}

async function dispatchEmailVerification(req: Request, user: UserRecord): Promise<MailDispatchResult> {
  if (!user.email) {
    throw new Error('当前账号没有邮箱地址，无法发送验证邮件。');
  }

  const { token } = issueEmailVerificationToken(user.id, user.email);
  return sendVerificationEmail({
    to: user.email,
    nickname: user.nickname,
    token,
    appBaseUrl: resolveAppBaseUrl(getRequestOrigin(req)),
  });
}

async function dispatchPasswordReset(req: Request, user: UserRecord): Promise<MailDispatchResult> {
  if (!user.email) {
    throw new Error('当前账号没有邮箱地址，无法发送重置密码邮件。');
  }

  const { token } = issuePasswordResetToken(user.id, user.email);
  return sendPasswordResetEmail({
    to: user.email,
    nickname: user.nickname,
    token,
    appBaseUrl: resolveAppBaseUrl(getRequestOrigin(req)),
  });
}

function getRequestOrigin(req: Request): string | undefined {
  const forwardedHost = req.header('x-forwarded-host');
  const host = forwardedHost || req.get('host');
  if (!host) {
    return undefined;
  }

  const forwardedProto = req.header('x-forwarded-proto');
  const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol || 'http';
  return `${protocol}://${host}`;
}

function getRequestIp(req: Request): string | undefined {
  const forwardedFor = req.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || undefined;
  }

  return req.ip || undefined;
}

function authIdentityKeyGenerator(req: Request) {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  const email = typeof body?.email === 'string' ? normalizeEmailAddress(body.email) : '';
  if (email) {
    return `email:${email}`;
  }

  return ipKeyGenerator(getRequestIp(req) || req.ip || '');
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) {
    return email.slice(0, 2) + '***';
  }

  const visibleLocal = localPart.length <= 2 ? (localPart[0] || '*') : localPart.slice(0, 2);
  return `${visibleLocal}***@${domain}`;
}

export default router;
