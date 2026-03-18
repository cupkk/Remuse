import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'remuse-api-'));

process.env.NODE_ENV = 'test';
process.env.APP_ROOT = tempRoot;
process.env.DB_PATH = path.join(tempRoot, 'data', 'remuse.db');
process.env.UPLOADS_DIR = path.join(tempRoot, 'uploads');
process.env.BACKUP_DIR = path.join(tempRoot, 'backups');
process.env.JWT_SECRET = 'this-is-a-long-test-secret-123456';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.DISABLE_LIVE_AI = 'true';
process.env.EMAIL_DELIVERY_MODE = 'log';
process.env.APP_BASE_URL = 'http://127.0.0.1:4173';
process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@example.com';

const { createApp } = await import('../../server.ts');
const { issueEmailVerificationToken, issuePasswordResetToken } = await import('../../services/authLifecycleStore.ts');
const { default: db } = await import('../../services/database.ts');

class SessionClient {
  accessToken = '';
  private cookies = new Map<string, string>();

  async request(
    baseUrl: string,
    pathname: string,
    options: {
      method?: string;
      body?: unknown;
      auth?: boolean;
    } = {},
  ) {
    const headers = new Headers();
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (options.auth !== false && this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    const cookieHeader = this.cookieHeader();
    if (cookieHeader) {
      headers.set('Cookie', cookieHeader);
    }

    const response = await fetch(`${baseUrl}${pathname}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    this.storeCookies(response);
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : null;
    return { response, data };
  }

  private cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  private storeCookies(response: Response) {
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : splitSetCookieHeader(response.headers.get('set-cookie') || '');

    for (const cookie of setCookies) {
      const [pair] = cookie.split(';');
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      this.cookies.set(key, value);
    }
  }
}

function splitSetCookieHeader(header: string) {
  if (!header) {
    return [];
  }
  return header.split(/,(?=[^;,\s]+=)/g).map((part) => part.trim()).filter(Boolean);
}

async function main() {
  const app = createApp();
  const server = await new Promise<http.Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server address.');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const publicCurated = await fetch(`${baseUrl}/api/curated`);
    assert.equal(publicCurated.status, 404);

    const admin = new SessionClient();
    const adminRegister = await admin.request(baseUrl, '/api/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        email: 'admin@example.com',
        password: 'Password123!',
        nickname: 'Admin Pilot',
        acceptPolicies: true,
      },
    });
    assert.equal(adminRegister.response.status, 200);
    admin.accessToken = adminRegister.data.accessToken;
    assert.equal(adminRegister.data.user.isAdmin, true);
    assert.equal(adminRegister.data.user.emailVerified, false);
    assert.equal(adminRegister.data.user.agreements.currentTermsVersion, '2026-03-13');

    const verifyToken = issueEmailVerificationToken(adminRegister.data.user.id, 'admin@example.com').token;
    const verifyResponse = await admin.request(baseUrl, '/api/auth/verify-email', {
      method: 'POST',
      auth: false,
      body: { token: verifyToken },
    });
    assert.equal(verifyResponse.response.status, 200);
    assert.equal(verifyResponse.data.user.emailVerified, true);

    const changePassword = await admin.request(baseUrl, '/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: 'Password123!',
        newPassword: 'Password456!',
      },
    });
    assert.equal(changePassword.response.status, 200);
    admin.accessToken = changePassword.data.accessToken;

    const resetToken = issuePasswordResetToken(adminRegister.data.user.id, 'admin@example.com').token;
    const resetPassword = await admin.request(baseUrl, '/api/auth/reset-password', {
      method: 'POST',
      auth: false,
      body: {
        token: resetToken,
        newPassword: 'Password789!',
      },
    });
    assert.equal(resetPassword.response.status, 200);
    admin.accessToken = resetPassword.data.accessToken;

    const loginOldPassword = await admin.request(baseUrl, '/api/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        email: 'admin@example.com',
        password: 'Password456!',
      },
    });
    assert.equal(loginOldPassword.response.status, 401);

    const loginNewPassword = await admin.request(baseUrl, '/api/auth/login', {
      method: 'POST',
      auth: false,
      body: {
        email: 'admin@example.com',
        password: 'Password789!',
      },
    });
    assert.equal(loginNewPassword.response.status, 200);
    admin.accessToken = loginNewPassword.data.accessToken;

    const meResponse = await admin.request(baseUrl, '/api/auth/me');
    assert.equal(meResponse.response.status, 200);
    assert.equal(meResponse.data.user.isAdmin, true);
    assert.equal(meResponse.data.user.usage.length, 2);

    const adminOverview = await admin.request(baseUrl, '/api/admin/overview');
    assert.equal(adminOverview.response.status, 200);
    assert.ok(adminOverview.data.summary7d);
    assert.ok(adminOverview.data.summary30d);
    assert.ok(Array.isArray(adminOverview.data.aiScopes7d));
    assert.ok(Array.isArray(adminOverview.data.productEvents7d));
    assert.ok(Array.isArray(adminOverview.data.topUsers));
    assert.ok(Array.isArray(adminOverview.data.feedback));
    assert.ok(adminOverview.data.productEvents7d.some((item: { eventType: string }) => item.eventType === 'register_success'));

    const user = new SessionClient();
    const userRegister = await user.request(baseUrl, '/api/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        email: 'user@example.com',
        password: 'UserPass123!',
        nickname: 'Museum User',
        acceptPolicies: true,
      },
    });
    assert.equal(userRegister.response.status, 200);
    user.accessToken = userRegister.data.accessToken;
    assert.equal(userRegister.data.user.isAdmin, false);

    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x3WQAAAAASUVORK5CYII=';
    const createItem = await user.request(baseUrl, '/api/items', {
      method: 'POST',
      body: {
        name: 'Launch Archive Item',
        hallId: '奶茶周边',
        category: '奶茶周边',
        imageBase64: tinyPng,
        story: 'A launch-day archive entry.',
        tags: ['launch'],
        status: 'raw',
      },
    });
    assert.equal(createItem.response.status, 200);
    assert.ok(createItem.data.item.imageUrl);
    assert.ok(createItem.data.item.coverImageUrl);

    const feedbackResponse = await user.request(baseUrl, '/api/feedback', {
      method: 'POST',
      body: {
        type: 'support',
        message: 'The launch candidate needs a clear support path and this verifies the feedback queue.',
      },
    });
    assert.equal(feedbackResponse.response.status, 200);

    const createThread = await user.request(baseUrl, '/api/memory/threads', {
      method: 'POST',
      body: {
        title: 'Launch FAQ',
      },
    });
    assert.equal(createThread.response.status, 200);

    const threadId = createThread.data.thread.id;
    const renameThread = await user.request(baseUrl, `/api/memory/threads/${threadId}`, {
      method: 'PATCH',
      body: {
        title: 'Commercial Launch FAQ',
      },
    });
    assert.equal(renameThread.response.status, 200);
    assert.equal(renameThread.data.thread.title, 'Commercial Launch FAQ');

    const queryThread = await user.request(baseUrl, `/api/memory/threads/${threadId}/query`, {
      method: 'POST',
      body: {
        query: '请基于已有记忆给我一个上线前检查建议',
      },
    });
    assert.equal(queryThread.response.status, 200);
    assert.ok(Array.isArray(queryThread.data.thread.messages));
    assert.ok(queryThread.data.thread.messages.length >= 2);

    const deleteThread = await user.request(baseUrl, `/api/memory/threads/${threadId}`, {
      method: 'DELETE',
    });
    assert.equal(deleteThread.response.status, 200);
    assert.equal(deleteThread.data.success, true);

    const adminOverviewAfterFeedback = await admin.request(baseUrl, '/api/admin/overview');
    assert.equal(adminOverviewAfterFeedback.response.status, 200);
    const openFeedback = adminOverviewAfterFeedback.data.feedback.find((item: { id: string }) => item.id === feedbackResponse.data.feedbackId);
    assert.ok(openFeedback);
    assert.ok(adminOverviewAfterFeedback.data.feedbackSummary.open >= 1);
    assert.ok(
      adminOverviewAfterFeedback.data.productEvents7d.some(
        (item: { eventType: string }) => item.eventType === 'register_success' || item.eventType === 'memory_query',
      ),
    );
    assert.ok(adminOverviewAfterFeedback.data.conversion7d);
    assert.ok(adminOverviewAfterFeedback.data.conversion30d);

    const searchUsers = await admin.request(baseUrl, '/api/admin/users?query=user@example.com');
    assert.equal(searchUsers.response.status, 200);
    assert.ok(Array.isArray(searchUsers.data.users));
    assert.ok(searchUsers.data.users.some((item: { email: string | null }) => item.email === 'user@example.com'));

    const userDetail = await admin.request(baseUrl, `/api/admin/users/${userRegister.data.user.id}`);
    assert.equal(userDetail.response.status, 200);
    assert.equal(userDetail.data.user.email, 'user@example.com');
    assert.ok(Array.isArray(userDetail.data.recentEvents));
    assert.ok(userDetail.data.recentEvents.length >= 1);

    const restrictUser = await admin.request(baseUrl, `/api/admin/users/${userRegister.data.user.id}/flag`, {
      method: 'PATCH',
      body: {
        status: 'restricted',
        note: 'API regression test restriction',
      },
    });
    assert.equal(restrictUser.response.status, 200);
    assert.equal(restrictUser.data.user.flagStatus, 'restricted');

    const blockedThreadCreate = await user.request(baseUrl, '/api/memory/threads', {
      method: 'POST',
      body: {
        title: 'Blocked by admin',
      },
    });
    assert.equal(blockedThreadCreate.response.status, 403);

    const updateFeedback = await admin.request(baseUrl, `/api/admin/feedback/${feedbackResponse.data.feedbackId}`, {
      method: 'PATCH',
      body: {
        status: 'closed',
      },
    });
    assert.equal(updateFeedback.response.status, 200);

    const deleteAccount = await user.request(baseUrl, '/api/auth/delete-account', {
      method: 'POST',
      body: {
        password: 'UserPass123!',
      },
    });
    assert.equal(deleteAccount.response.status, 200);

    const deletedUserMe = await user.request(baseUrl, '/api/auth/me');
    assert.equal(deletedUserMe.response.status, 401);

    console.log('API regression checks passed.');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    db.close();
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

await main();
