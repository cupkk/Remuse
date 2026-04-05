import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import db, { createRefreshTokenSession, getUserByEmail } from '../services/database.ts';
import {
  getRefreshTokenExpiresAt,
  normalizeEmailAddress,
  signAccessToken,
  signRefreshToken,
} from '../services/auth.ts';
import { APP_CONFIG } from '../services/appConfig.ts';
import { DEFAULT_HALLS } from '../services/halls.ts';
import { getManagedUploadInfo } from '../services/storage.ts';

type JsonRecord = Record<string, unknown>;

interface ScriptOptions {
  adminEmail: string;
  baseUrl: string;
  publicBaseUrl: string | null;
  requestedSampleImageSource: string | null;
}

interface SessionContext {
  user: {
    id: string;
    email: string | null;
    nickname: string;
    email_verified?: number;
    email_verified_at?: string | null;
  };
  accessToken: string;
  refreshToken: string;
}

const options = resolveOptions(process.argv.slice(2));

let createdItemId: string | null = null;
let createdStickerId: string | null = null;
let restoredEmailVerification = false;
let temporaryRefreshTokenId: string | null = null;
let cleanupAccessToken: string | null = null;

const summary: JsonRecord = {
  timestamp: new Date().toISOString(),
  target: {
    baseUrl: options.baseUrl,
    publicBaseUrl: options.publicBaseUrl,
  },
  config: {
    appBaseUrl: APP_CONFIG.appBaseUrl,
    geminiBaseUrl: APP_CONFIG.geminiBaseUrl,
    geminiFallbackBaseUrls: APP_CONFIG.geminiFallbackBaseUrls,
    allowThirdPartyGeminiProxy: APP_CONFIG.allowThirdPartyGeminiProxy,
    emailDeliveryMode: process.env.EMAIL_DELIVERY_MODE || (process.env.RESEND_API_KEY ? 'resend' : 'log'),
  },
};

try {
  const session = issueSession(options.adminEmail);
  temporaryRefreshTokenId = readJwtId(session.refreshToken);
  cleanupAccessToken = session.accessToken;
  const sampleImageSource = resolveSampleImageSource(session.user.id, options.requestedSampleImageSource);

  summary.target = {
    ...(summary.target as JsonRecord),
    sampleImageSource,
  };

  summary.auth = {
    adminEmail: session.user.email,
    adminUserId: session.user.id,
    nickname: session.user.nickname,
  };

  summary.health = await runHealthChecks(options);
  summary.admin = await runAdminChecks(options, session);
  summary.mail = await runMailChecks(options, session);
  const aiResult = await runAiChecks(options, session);
  createdItemId = aiResult.createdItemId;
  createdStickerId = aiResult.createdStickerId;
  summary.ai = aiResult.summary;

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  summary.error = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify(summary, null, 2));
  process.exitCode = 1;
} finally {
  await cleanupArtifacts(options.baseUrl, createdItemId, createdStickerId, cleanupAccessToken);
  if (!restoredEmailVerification) {
    restoreEmailVerification(options.adminEmail);
  }
  if (temporaryRefreshTokenId) {
    try {
      db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\') WHERE id = ? AND revoked_at IS NULL').run(temporaryRefreshTokenId);
    } catch {
      // Best-effort cleanup.
    }
  }
}

function resolveOptions(argv: string[]): ScriptOptions {
  const args = parseArgs(argv);
  const adminEmail = normalizeEmailAddress(
    args['admin-email']
      || process.env.SMOKE_ADMIN_EMAIL
      || '',
  );

  if (!adminEmail) {
    throw new Error('缺少管理员邮箱，请使用 --admin-email 或设置 SMOKE_ADMIN_EMAIL。');
  }

  const baseUrl = normalizeBaseUrl(args['base-url'] || process.env.SMOKE_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`);
  const publicBaseUrl = normalizeBaseUrl(args['public-base-url'] || APP_CONFIG.appBaseUrl || '');
  return {
    adminEmail,
    baseUrl,
    publicBaseUrl: publicBaseUrl || null,
    requestedSampleImageSource: args['sample-image-url'] || null,
  };
}

function parseArgs(argv: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry?.startsWith('--')) {
      continue;
    }

    const key = entry.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[key] = 'true';
      continue;
    }

    result[key] = next;
    index += 1;
  }
  return result;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function issueSession(email: string): SessionContext {
  const user = getUserByEmail(email);
  if (!user || !user.email) {
    throw new Error(`找不到管理员用户：${email}`);
  }

  if (user.role !== 'admin') {
    throw new Error(`用户 ${email} 不是管理员，请先运行 scripts/set-user-role.ts 设置角色。`);
  }

  const refreshTokenId = randomUUID();
  createRefreshTokenSession({
    id: refreshTokenId,
    user_id: user.id,
    expires_at: getRefreshTokenExpiresAt(),
  });

  return {
    user,
    accessToken: signAccessToken(user.id),
    refreshToken: signRefreshToken(user.id, refreshTokenId),
  };
}

function readJwtId(token: string) {
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { jti?: string };
  return parsed.jti || null;
}

async function runHealthChecks(options: ScriptOptions) {
  const local = await fetchJson(`${options.baseUrl}/api/healthz`);
  const result: JsonRecord = {
    local: {
      status: local.status,
      ok: local.body?.ok === true,
    },
  };

  if (options.publicBaseUrl) {
    const publicHealth = await fetchJson(`${options.publicBaseUrl}/api/healthz`);
    result.public = {
      status: publicHealth.status,
      ok: publicHealth.body?.ok === true,
    };
  }

  return result;
}

async function runAdminChecks(options: ScriptOptions, session: SessionContext) {
  const headers = authHeaders(session.accessToken);
  const overview = await fetchJson(`${options.baseUrl}/api/admin/overview`, {
    headers,
  });
  const search = await fetchJson(`${options.baseUrl}/api/admin/users?query=${encodeURIComponent(options.adminEmail)}`, {
    headers,
  });

  const matchedUser = Array.isArray(search.body?.users)
    ? (search.body.users as Array<{ userId?: string; email?: string | null }>).find(
        (entry) => normalizeEmailAddress(entry.email || '') === options.adminEmail,
      )
    : null;

  if (!matchedUser?.userId) {
    throw new Error(`管理员搜索结果中未包含 ${options.adminEmail}。`);
  }

  const detail = await fetchJson(`${options.baseUrl}/api/admin/users/${matchedUser.userId}`, {
    headers,
  });

  const watchResult = await fetchJson(`${options.baseUrl}/api/admin/users/${matchedUser.userId}/flag`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      status: 'watch',
      note: 'production smoke check',
    }),
  });

  const clearResult = await fetchJson(`${options.baseUrl}/api/admin/users/${matchedUser.userId}/flag`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      status: 'cleared',
      note: 'production smoke check cleared',
    }),
  });

  return {
    overviewStatus: overview.status,
    totalAiCalls7d: overview.body?.totalAiCalls7d ?? null,
    activeUsers7d: overview.body?.activeUsers7d ?? null,
    flaggedUsers: Array.isArray(overview.body?.flaggedUsers) ? overview.body.flaggedUsers.length : 0,
    searchStatus: search.status,
    searchResults: Array.isArray(search.body?.users) ? search.body.users.length : 0,
    detailStatus: detail.status,
    detailRecentEvents: Array.isArray(detail.body?.recentEvents) ? detail.body.recentEvents.length : 0,
    watchStatus: watchResult.status,
    clearStatus: clearResult.status,
  };
}

async function runMailChecks(options: ScriptOptions, session: SessionContext) {
  const user = getUserByEmail(options.adminEmail);
  if (!user) {
    throw new Error(`找不到用于邮件验收的用户：${options.adminEmail}`);
  }

  const original = {
    emailVerified: Number(user.email_verified || 0),
    emailVerifiedAt: user.email_verified_at || null,
  };

  db.prepare(`
    UPDATE users
    SET email_verified = 0,
        email_verified_at = NULL
    WHERE id = ?
  `).run(user.id);

  try {
    const verification = await fetchJson(`${options.baseUrl}/api/auth/send-verification`, {
      method: 'POST',
      headers: authHeaders(session.accessToken),
      body: JSON.stringify({}),
    });

    if ((verification.body?.emailDelivery as JsonRecord | undefined)?.mode !== 'resend') {
      throw new Error('验证邮件未使用 resend 投递模式。');
    }

    restoredEmailVerification = true;
    db.prepare(`
      UPDATE users
      SET email_verified = ?,
          email_verified_at = ?
      WHERE id = ?
    `).run(original.emailVerified, original.emailVerifiedAt, user.id);

    return {
      verificationStatus: verification.status,
      deliveryMode: (verification.body?.emailDelivery as JsonRecord | undefined)?.mode || null,
      targetEmail: user.email,
    };
  } catch (error) {
    db.prepare(`
      UPDATE users
      SET email_verified = ?,
          email_verified_at = ?
      WHERE id = ?
    `).run(original.emailVerified, original.emailVerifiedAt, user.id);
    restoredEmailVerification = true;
    throw error;
  }
}

function restoreEmailVerification(email: string) {
  const user = getUserByEmail(email);
  if (!user || user.email_verified) {
    restoredEmailVerification = true;
    return;
  }

  db.prepare(`
    UPDATE users
    SET email_verified = 1,
        email_verified_at = COALESCE(email_verified_at, datetime('now'))
    WHERE id = ?
  `).run(user.id);
  restoredEmailVerification = true;
}

async function runAiChecks(options: ScriptOptions, session: SessionContext) {
  const headers = authHeaders(session.accessToken);
  const sampleImageSource = resolveSampleImageSource(session.user.id, options.requestedSampleImageSource);
  const imageBase64 = await fetchImageAsBase64(sampleImageSource);

  const guide = await fetchJson(`${options.baseUrl}/api/ai/generate-transformation-guide`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      items: [
        {
          name: '奶茶玻璃瓶',
          category: '瓶瓶罐罐',
          material: '玻璃',
          description: '透明玻璃瓶，适合改造为收纳或展示器皿。',
          story: '保留了日常记忆的一只奶茶玻璃瓶。',
          tags: ['玻璃', '收纳', '再生'],
        },
      ],
    }),
  });

  const analysis = await fetchJson(`${options.baseUrl}/api/ai/analyze-item`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      imageBase64,
    }),
  });

  const analysisBody = analysis.body?.analysis as JsonRecord | undefined;
  if (!analysisBody?.name || !analysisBody?.category) {
    throw new Error('AI 识别未返回有效的藏品数据。');
  }

  const createdItem = await fetchJson(`${options.baseUrl}/api/items`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: analysisBody.name,
      hallId: analysisBody.category,
      category: analysisBody.category,
      material: analysisBody.material,
      story: analysisBody.story,
      tags: Array.isArray(analysisBody.tags) ? analysisBody.tags : [],
      imageBase64,
      status: 'raw',
    }),
  });

  const itemId = (createdItem.body?.item as JsonRecord | undefined)?.id as string | undefined;
  if (!itemId) {
    throw new Error('归档验收步骤未返回藏品 ID。');
  }
  const coverImageUrl = (createdItem.body?.item as JsonRecord | undefined)?.coverImageUrl as string | undefined;
  const hasGeneratedCover = typeof coverImageUrl === 'string'
    && (
      coverImageUrl.startsWith('data:image/')
      || coverImageUrl.startsWith('/api/uploads/item-covers/')
      || /^https?:\/\/.+\/api\/uploads\/item-covers\//.test(coverImageUrl)
    );
  if (!hasGeneratedCover) {
    throw new Error('归档验收步骤未返回已生成的封面图。');
  }

  const sticker = await fetchJson(`${options.baseUrl}/api/ai/generate-sticker`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      imageBase64,
      itemName: String(analysisBody.name),
    }),
  });

  const stickerBody = sticker.body as JsonRecord | undefined;
  const stickerImageUrl = stickerBody?.stickerImageUrl as string | undefined;
  if (!stickerImageUrl?.startsWith('data:image/')) {
    throw new Error('AI 贴纸生成未返回内联图片。');
  }

  const createdSticker = await fetchJson(`${options.baseUrl}/api/stickers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      originalItemId: itemId,
      imageBase64: stickerImageUrl.split(',')[1],
      dramaText: stickerBody?.dramaText || '',
      category: analysisBody.category,
    }),
  });

  const stickerId = (createdSticker.body?.sticker as JsonRecord | undefined)?.id as string | undefined;
  if (!stickerId) {
    throw new Error('贴纸保存验收步骤未返回贴纸 ID。');
  }

  return {
    createdItemId: itemId,
    createdStickerId: stickerId,
    summary: {
      guideStatus: guide.status,
      guideTitle: ((guide.body?.guide as JsonRecord | undefined)?.title as string | undefined) || null,
      analysisStatus: analysis.status,
      analysisName: analysisBody.name,
      analysisCategory: analysisBody.category,
      archiveStatus: createdItem.status,
      archiveCoverGenerated: hasGeneratedCover,
      archiveCoverImageUrl: coverImageUrl || null,
      stickerStatus: sticker.status,
      stickerSavedStatus: createdSticker.status,
      sampleImageSource,
    },
  };
}

async function cleanupArtifacts(baseUrl: string, itemId: string | null, stickerId: string | null, accessToken: string | null) {
  if (!accessToken) {
    return;
  }

  const headers = authHeaders(accessToken);

  if (stickerId) {
    await fetch(`${baseUrl}/api/stickers/${stickerId}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
  }

  if (itemId) {
    await fetch(`${baseUrl}/api/items/${itemId}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
  }
}

async function fetchImageAsBase64(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载验收样例图片失败：${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  }

  const buffer = await readFile(url);
  return buffer.toString('base64');
}

function resolveSampleImageSource(userId: string, requestedSource: string | null) {
  if (requestedSource) {
    return requestedSource;
  }

  const row = db.prepare(`
    SELECT image_path
    FROM collected_items
    WHERE user_id = ?
      AND image_path IS NOT NULL
      AND image_path != ''
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId) as { image_path?: string } | undefined;

  if (row?.image_path) {
    const managed = getManagedUploadInfo(row.image_path);
    if (managed?.absolutePath) {
      return managed.absolutePath;
    }
  }

  const fallback = DEFAULT_HALLS[0]?.imageUrl;
  if (!fallback) {
    throw new Error('生产烟雾测试缺少可用的样例图片来源。');
  }

  return fallback;
}

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new Error(`请求失败：${url}，状态 ${response.status} ${response.statusText}，响应 ${text}`);
  }

  return {
    status: response.status,
    body,
  };
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return { raw: text };
  }
}
