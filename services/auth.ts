// ============================================================
// Re-Museum 认证模块 — JWT + bcrypt
// ============================================================

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_COOKIE_NAME = 'remuse_refresh';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('\u7f3a\u5c11 JWT_SECRET\uff0c\u4e14\u957f\u5ea6\u81f3\u5c11\u4e3a 16 \u4e2a\u5b57\u7b26');
  }
  return secret;
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
  jti?: string;
  exp?: number;
  iat?: number;
}

/**
 * 生成 access token (短期)
 */
export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRES,
  });
}

/**
 * 生成 refresh token (长期)
 */
export function signRefreshToken(userId: string, tokenId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh', jti: tokenId }, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRES,
  });
}

/**
 * 验证并解码 token
 */
export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret()) as unknown as TokenPayload;
}

export function getRefreshTokenExpiresAt(): string {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();
}

export function getEmailVerificationExpiresAt(): string {
  return new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS).toISOString();
}

export function getPasswordResetExpiresAt(): string {
  return new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();
}

export function createOpaqueToken(size = 32): string {
  return crypto.randomBytes(size).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 密码哈希
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 10);
}

/**
 * 密码验证
 */
export async function comparePassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
