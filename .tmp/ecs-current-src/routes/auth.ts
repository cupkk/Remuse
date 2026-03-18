import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
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
  resolveAppBaseUrl,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../services/mailer.ts';
import { LEGAL_VERSION_SNAPSHOT } from '../services/legalDocuments.ts';
import { isAdminUser, resolveUserRole } from '../services/permissions.ts';
import { deleteUserAccount, recordUserConsents } from '../services/userGovernance.ts';
import { getUsageSnapshotForUser, recordProductUsageEvent } from '../services/usageQuota.ts';

const router = Router();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
type UserRecord = NonNullable<ReturnType<typeof getUserById>>;

const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login or registration attempts. Please try again later.' },
});

const guestBootstrapLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many guest sessions created. Please try again later.' },
});

const authSessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests. Please try again later.' },
});

const authMailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many email requests. Please try again later.' },
});

const authRecoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many account recovery attempts. Please try again later.' },
});

const emailSchema = z.string().trim().email('Please enter a valid email address.');
const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  nickname: z.string().trim().min(1).max(50).optional(),
  acceptPolicies: z.boolean().refine(Boolean, {
    message: 'You must agree to the terms, privacy policy, and AI notice before registering.',
  }),
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Please enter your password.'),
});
const forgotPasswordSchema = z.object({
  email: emailSchema,
});
const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, 'Verification token is required.'),
});
const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required.'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters.'),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Please enter your current password.'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters.'),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: 'New password must be different from the current password.',
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
  message: 'At least one preference field is required.',
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
    res.status(500).json({ error: 'Unable to create guest account.' });
  }
});

router.post('/register', authAttemptLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
      return;
    }

    const email = normalizeEmailAddress(parsed.data.email);
    const { password, nickname } = parsed.data;
    const existing = getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'This email address is already registered.' });
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
    res.status(500).json({ error: 'Registration failed.' });
  }
});

router.post('/login', authAttemptLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
      return;
    }

    const email = normalizeEmailAddress(parsed.data.email);
    const { password } = parsed.data;
    const user = getUserByEmail(email);
    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    recordProductUsageEvent({
      userId: user.id,
      eventType: 'login_success',
    });
    sendSessionResponse(res, user.id, user);
  } catch {
    res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/forgot-password', authMailLimiter, async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
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
    message: 'If an account exists for this email address, a password reset link has been sent.',
  });
});

router.post('/send-verification', authMailLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (user.is_guest || !user.email) {
      res.status(403).json({ error: 'Please upgrade this guest account before verifying an email address.' });
      return;
    }

    if (isEmailVerified(user)) {
      res.status(409).json({ error: 'This email address is already verified.' });
      return;
    }

    const emailDelivery = await dispatchEmailVerification(req, user);
    res.json({
      success: true,
      message: 'Verification email sent.',
      emailDelivery,
    });
  } catch {
    res.status(503).json({ error: 'Unable to send verification email right now.' });
  }
});

router.post('/verify-email', authRecoveryLimiter, async (req: Request, res: Response) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
    return;
  }

  const result = verifyEmailWithToken(parsed.data.token);
  if (result.status !== 'ok') {
    res.status(result.status === 'expired' ? 410 : 400).json({
      error:
        result.status === 'expired'
          ? 'Verification link expired. Please request a new verification email.'
          : 'Verification link is invalid.',
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
    message: 'Email verified successfully.',
    user: sanitizeUser(result.user),
  });
});

router.post('/reset-password', authRecoveryLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const result = resetPasswordWithToken(parsed.data.token, passwordHash);
    if (result.status !== 'ok') {
      res.status(result.status === 'expired' ? 410 : 400).json({
        error:
          result.status === 'expired'
            ? 'Password reset link expired. Please request a new one.'
            : 'Password reset link is invalid.',
      });
      return;
    }

    revokeRefreshTokenSessionsForUser(result.user.id);
    sendSessionResponse(res, result.user.id, result.user, {
      message: 'Password reset successful.',
    });
  } catch {
    res.status(500).json({ error: 'Password reset failed.' });
  }
});

router.post('/refresh', authSessionLimiter, (req: Request, res: Response) => {
  try {
    const refreshToken = extractRefreshToken(req);
    if (!refreshToken) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_missing', message: 'Missing refresh token.' });
      return;
    }

    const payload = verifyToken(refreshToken);
    if (payload.type !== 'refresh' || !payload.jti) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_invalid', message: 'Refresh token type is invalid.' });
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
      res.status(401).json({ error: 'refresh_invalid', message: 'Refresh token is invalid. Please sign in again.' });
      return;
    }

    const user = getUserById(payload.sub);
    if (!user) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'User not found.' });
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
      res.status(401).json({ error: 'refresh_expired', message: 'Refresh token expired. Please sign in again.' });
      return;
    }

    res.status(401).json({ error: 'refresh_invalid', message: 'Refresh token verification failed.' });
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
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

router.patch('/preferences', authSessionLimiter, authMiddleware, (req: Request, res: Response) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
    return;
  }

  const user = updateUserPreferences(req.userId!, parsed.data);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({ user: sanitizeUser(user) });
});

router.post('/change-password', authSessionLimiter, authMiddleware, async (req: Request, res: Response) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
      return;
    }

    const user = getUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (user.is_guest || !user.password_hash) {
      res.status(403).json({ error: 'Please upgrade this guest account before changing its password.' });
      return;
    }

    const passwordMatches = await comparePassword(parsed.data.currentPassword, user.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const updatedUser = updateUserPassword(user.id, passwordHash);
    if (!updatedUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    revokeRefreshTokenSessionsForUser(user.id);
    sendSessionResponse(res, updatedUser.id, updatedUser);
  } catch {
    res.status(500).json({ error: 'Password change failed.' });
  }
});

router.post('/logout-others', authSessionLimiter, authMiddleware, (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenFromCookies(req);
  if (!refreshToken) {
    res.status(400).json({ error: 'Current session is unavailable.' });
    return;
  }

  try {
    const payload = verifyToken(refreshToken);
    if (payload.type !== 'refresh' || !payload.jti) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'refresh_invalid', message: 'Current session is invalid.' });
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
      res.status(401).json({ error: 'refresh_invalid', message: 'Current session is invalid.' });
      return;
    }

    revokeRefreshTokenSessionsForUser(req.userId!, payload.jti);
    res.json({ success: true });
  } catch {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'refresh_invalid', message: 'Current session is invalid.' });
  }
});

router.post('/delete-account', authSessionLimiter, authMiddleware, async (req: Request, res: Response) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request payload.' });
    return;
  }

  const user = getUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (!user.is_guest) {
    if (!user.password_hash) {
      res.status(403).json({ error: 'This account cannot be deleted without a password reset first.' });
      return;
    }

    if (!parsed.data.password) {
      res.status(400).json({ error: 'Please enter your current password to delete this account.' });
      return;
    }

    const passwordMatches = await comparePassword(parsed.data.password, user.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Current password is incorrect.' });
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
    isAdmin: isAdminUser(user),
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
    throw new Error('Cannot send a verification email to an account without an email address.');
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
    throw new Error('Cannot send a password reset email to an account without an email address.');
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

export default router;
