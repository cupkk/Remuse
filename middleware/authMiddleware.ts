import { NextFunction, Request, Response } from 'express';
import { getRefreshTokenSession, getUserById } from '../services/database.ts';
import { REFRESH_COOKIE_NAME, verifyToken } from '../services/auth.ts';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: ReturnType<typeof getUserById>;
    }
  }
}

type AuthStrategy = 'access-token' | 'refresh-cookie';

interface AuthResolutionOptions {
  allowRefreshCookie?: boolean;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const resolved = resolveAuthenticatedRequest(req, { allowRefreshCookie: false });

  if (!resolved.ok) {
    res.status(401).json(resolved.errorBody);
    return;
  }

  req.userId = resolved.user.id;
  req.user = resolved.user;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const resolved = resolveAuthenticatedRequest(req, { allowRefreshCookie: false });

  if (resolved.ok) {
    req.userId = resolved.user.id;
    req.user = resolved.user;
  } else {
    req.userId = undefined;
    req.user = undefined;
  }

  next();
}

export function assetAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const resolved = resolveAuthenticatedRequest(req, { allowRefreshCookie: true });

  if (!resolved.ok) {
    res.status(401).json(resolved.errorBody);
    return;
  }

  req.userId = resolved.user.id;
  req.user = resolved.user;
  next();
}

export function getRefreshTokenFromCookies(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[REFRESH_COOKIE_NAME] || null;
}

function resolveAuthenticatedRequest(
  req: Request,
  options: AuthResolutionOptions,
):
  | { ok: true; strategy: AuthStrategy; user: NonNullable<ReturnType<typeof getUserById>> }
  | { ok: false; errorBody: { error: string; message?: string } } {
  const accessToken = getBearerToken(req.headers.authorization);
  if (accessToken) {
    return validateAccessToken(accessToken);
  }

  if (options.allowRefreshCookie) {
    const refreshToken = getRefreshTokenFromCookies(req);
    if (refreshToken) {
      return validateRefreshCookie(refreshToken);
    }
  }

  return { ok: false, errorBody: { error: '未提供认证令牌' } };
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.slice(7).trim();
  return token || null;
}

function validateAccessToken(token: string) {
  try {
    const payload = verifyToken(token);

    if (payload.type !== 'access') {
      return { ok: false as const, errorBody: { error: '令牌类型无效' } };
    }

    const user = getUserById(payload.sub);
    if (!user) {
      return { ok: false as const, errorBody: { error: '用户不存在' } };
    }

    return { ok: true as const, strategy: 'access-token' as const, user };
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name === 'TokenExpiredError') {
      return { ok: false as const, errorBody: { error: 'token_expired', message: '令牌已过期' } };
    }

    return { ok: false as const, errorBody: { error: '令牌验证失败' } };
  }
}

function validateRefreshCookie(token: string) {
  try {
    const payload = verifyToken(token);
    if (payload.type !== 'refresh' || !payload.jti) {
      return { ok: false as const, errorBody: { error: 'refresh_invalid' } };
    }

    const session = getRefreshTokenSession(payload.jti);
    if (
      !session ||
      session.user_id !== payload.sub ||
      session.revoked_at ||
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return { ok: false as const, errorBody: { error: 'refresh_invalid' } };
    }

    const user = getUserById(payload.sub);
    if (!user) {
      return { ok: false as const, errorBody: { error: '用户不存在' } };
    }

    return { ok: true as const, strategy: 'refresh-cookie' as const, user };
  } catch {
    return { ok: false as const, errorBody: { error: 'refresh_invalid' } };
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) {
        return acc;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}
