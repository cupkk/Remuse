// ============================================================
// Re-Museum 认证模块 — JWT + bcrypt
// ============================================================

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE_NAME = 'remuse_refresh';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET is required and must be at least 16 characters long');
  }
  return secret;
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
