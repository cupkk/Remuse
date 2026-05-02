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
process.env.AI_MOCK_MODE = 'true';
process.env.EMAIL_DELIVERY_MODE = 'log';
process.env.APP_BASE_URL = 'http://127.0.0.1:4173';

const { createApp } = await import('../../server.ts');
const { issueEmailVerificationToken, issuePasswordResetToken } = await import('../../services/authLifecycleStore.ts');
const { default: db, updateUserRole } = await import('../../services/database.ts');

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

    const malformedJsonResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{"email":',
    });
    assert.equal(malformedJsonResponse.status, 400);
    assert.equal(malformedJsonResponse.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await malformedJsonResponse.json(), { error: '请求体不是合法的 JSON。' });

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
    assert.equal(adminRegister.data.user.isAdmin, false);
    assert.equal(adminRegister.data.user.emailVerified, false);
    assert.equal(adminRegister.data.user.agreements.currentTermsVersion, '2026-03-13');

    const promotedAdmin = updateUserRole(adminRegister.data.user.id, 'admin');
    assert.equal(promotedAdmin?.role, 'admin');

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
    assert.equal(meResponse.data.user.usage.length, 3);
    assert.deepEqual(
      meResponse.data.user.usage.map((item: { scope: string }) => item.scope).sort(),
      ['gemini-image', 'stepfun-text', 'stepfun-vision'],
    );

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

    const invalidItemUpload = await user.request(baseUrl, '/api/items', {
      method: 'POST',
      body: {
        name: 'Broken Upload',
        hallId: 'other',
        category: 'other',
        imageBase64: 'not-valid-base64!!',
        story: 'Should be rejected.',
        status: 'raw',
      },
    });
    assert.equal(invalidItemUpload.response.status, 400);
    assert.equal(invalidItemUpload.data.error, '上传内容不是合法的 base64 数据。');

    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5x3WQAAAAASUVORK5CYII=';
    const createItem = await user.request(baseUrl, '/api/items', {
      method: 'POST',
      body: {
        name: 'Launch Archive Item',
        hallId: 'other',
        category: 'other',
        imageBase64: tinyPng,
        story: 'A launch-day archive entry.',
        tags: ['launch'],
        status: 'raw',
      },
    });
    assert.equal(createItem.response.status, 200);
    assert.ok(createItem.data.item.imageUrl);
    assert.ok(createItem.data.item.coverImageUrl);

    const partner = new SessionClient();
    const partnerRegister = await partner.request(baseUrl, '/api/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        email: 'partner@example.com',
        password: 'PartnerPass123!',
        nickname: 'Partner User',
        acceptPolicies: true,
      },
    });
    assert.equal(partnerRegister.response.status, 200);
    partner.accessToken = partnerRegister.data.accessToken;

    const outsider = new SessionClient();
    const outsiderRegister = await outsider.request(baseUrl, '/api/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        email: 'outsider@example.com',
        password: 'OutsiderPass123!',
        nickname: 'Outsider User',
        acceptPolicies: true,
      },
    });
    assert.equal(outsiderRegister.response.status, 200);
    outsider.accessToken = outsiderRegister.data.accessToken;

    const createSharedMuseum = await user.request(baseUrl, '/api/shared-museums', {
      method: 'POST',
      body: {
        name: 'Launch Shared Museum',
        description: 'Shared launch memories.',
        anniversaryDate: '2026-03-12',
        theme: 'shared-memory',
      },
    });
    assert.equal(createSharedMuseum.response.status, 200);
    assert.equal(createSharedMuseum.data.museum.members.length, 1);
    assert.equal(createSharedMuseum.data.museum.inviteEnabled, true);
    const sharedMuseumId = createSharedMuseum.data.museum.id as string;
    const originalInviteCode = createSharedMuseum.data.museum.inviteCode as string;

    const joinSharedMuseum = await partner.request(baseUrl, '/api/shared-museums/join', {
      method: 'POST',
      body: {
        inviteCode: originalInviteCode,
      },
    });
    assert.equal(joinSharedMuseum.response.status, 200);
    assert.equal(joinSharedMuseum.data.museum.members.length, 2);

    const joinSharedMuseumAgain = await partner.request(baseUrl, '/api/shared-museums/join', {
      method: 'POST',
      body: {
        inviteCode: originalInviteCode,
      },
    });
    assert.equal(joinSharedMuseumAgain.response.status, 200);
    assert.equal(joinSharedMuseumAgain.data.alreadyJoined, true);

    const joinSharedMuseumWhenFull = await outsider.request(baseUrl, '/api/shared-museums/join', {
      method: 'POST',
      body: {
        inviteCode: originalInviteCode,
      },
    });
    assert.equal(joinSharedMuseumWhenFull.response.status, 409);

    const creatorLeaveBlocked = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/leave`, {
      method: 'POST',
    });
    assert.equal(creatorLeaveBlocked.response.status, 409);

    const revokeInvite = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/invite/revoke`, {
      method: 'POST',
    });
    assert.equal(revokeInvite.response.status, 200);
    assert.equal(revokeInvite.data.museum.inviteEnabled, false);

    const joinWithRevokedInvite = await outsider.request(baseUrl, '/api/shared-museums/join', {
      method: 'POST',
      body: {
        inviteCode: originalInviteCode,
      },
    });
    assert.equal(joinWithRevokedInvite.response.status, 409);

    const resetInvite = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/invite/reset`, {
      method: 'POST',
    });
    assert.equal(resetInvite.response.status, 200);
    assert.equal(resetInvite.data.museum.inviteEnabled, true);
    assert.notEqual(resetInvite.data.museum.inviteCode, originalInviteCode);
    const refreshedInviteCode = resetInvite.data.museum.inviteCode as string;

    const joinWithExpiredInvite = await outsider.request(baseUrl, '/api/shared-museums/join', {
      method: 'POST',
      body: {
        inviteCode: originalInviteCode,
      },
    });
    assert.equal(joinWithExpiredInvite.response.status, 404);

    const partnerLeaveSharedMuseum = await partner.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/leave`, {
      method: 'POST',
    });
    assert.equal(partnerLeaveSharedMuseum.response.status, 200);
    assert.equal(partnerLeaveSharedMuseum.data.success, true);

    const joinWithResetInvite = await outsider.request(baseUrl, '/api/shared-museums/join', {
      method: 'POST',
      body: {
        inviteCode: refreshedInviteCode,
      },
    });
    assert.equal(joinWithResetInvite.response.status, 200);
    assert.equal(joinWithResetInvite.data.museum.members.length, 2);

    const addSharedMuseumItem = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/items`, {
      method: 'POST',
      body: {
        sourceItemId: createItem.data.item.id,
        sharedNote: 'Launch week keepsake.',
        relationLabel: 'Launch',
      },
    });
    assert.equal(addSharedMuseumItem.response.status, 200);
    assert.equal(addSharedMuseumItem.data.museum.itemCount, 1);
    assert.ok(Array.isArray(addSharedMuseumItem.data.museum.items));
    assert.equal(addSharedMuseumItem.data.museum.items.length, 1);
    const sharedMuseumItemId = addSharedMuseumItem.data.museum.items[0].id as string;

    const updateSharedMuseumItem = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/items/${sharedMuseumItemId}`, {
      method: 'PATCH',
      body: {
        sharedNote: 'Launch week keepsake, updated after review.',
        relationLabel: 'Milestone',
      },
    });
    assert.equal(updateSharedMuseumItem.response.status, 200);
    assert.equal(updateSharedMuseumItem.data.item.sharedNote, 'Launch week keepsake, updated after review.');
    assert.equal(updateSharedMuseumItem.data.item.relationLabel, 'Milestone');

    const saveSharedMuseumReport = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/reports`, {
      method: 'POST',
      body: {
        monthKey: '2026-03',
        monthLabel: '2026 年 3 月',
        itemCount: 1,
        categoryCount: 1,
        topCategories: ['other'],
        topTags: ['launch'],
        relationLabels: ['Milestone'],
        highlights: ['Added the first shared launch keepsake.'],
        narrative: 'The shared museum captured its first launch memory.',
        timeline: [
          {
            id: sharedMuseumItemId,
            name: 'Launch Archive Item',
            dateLabel: '3/27',
            sharedNote: 'Launch week keepsake, updated after review.',
            relationLabel: 'Milestone',
            coverImageUrl: createItem.data.item.coverImageUrl,
            imageUrl: createItem.data.item.imageUrl,
          },
        ],
        milestoneMessage: 'First month archived together.',
      },
    });
    assert.equal(saveSharedMuseumReport.response.status, 200);
    assert.ok(Array.isArray(saveSharedMuseumReport.data.museum.reports));
    assert.equal(saveSharedMuseumReport.data.museum.reports.length, 1);
    assert.equal(saveSharedMuseumReport.data.museum.reports[0].monthKey, '2026-03');

    const updateSharedMuseumReport = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/reports`, {
      method: 'POST',
      body: {
        monthKey: '2026-03',
        monthLabel: '2026 年 3 月',
        itemCount: 1,
        categoryCount: 1,
        topCategories: ['other'],
        topTags: ['launch'],
        relationLabels: ['Milestone'],
        highlights: ['Updated summary for the same saved month.'],
        narrative: 'The saved monthly review was updated in place.',
        timeline: [
          {
            id: sharedMuseumItemId,
            name: 'Launch Archive Item',
            dateLabel: '3/27',
            sharedNote: 'Launch week keepsake, updated after review.',
            relationLabel: 'Milestone',
            coverImageUrl: createItem.data.item.coverImageUrl,
            imageUrl: createItem.data.item.imageUrl,
          },
        ],
        milestoneMessage: 'Still the same month, but with an updated summary.',
      },
    });
    assert.equal(updateSharedMuseumReport.response.status, 200);
    assert.equal(updateSharedMuseumReport.data.museum.reports.length, 1);
    assert.equal(updateSharedMuseumReport.data.museum.reports[0].snapshot.narrative, 'The saved monthly review was updated in place.');

    const removeSharedMuseumItem = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/items/${sharedMuseumItemId}`, {
      method: 'DELETE',
    });
    assert.equal(removeSharedMuseumItem.response.status, 200);
    assert.equal(removeSharedMuseumItem.data.success, true);
    assert.equal(removeSharedMuseumItem.data.museum.itemCount, 0);

    const enableQuietMode = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}`, {
      method: 'PATCH',
      body: {
        anniversaryDate: '2026-03-20',
        quietMode: true,
      },
    });
    assert.equal(enableQuietMode.response.status, 200);
    assert.equal(enableQuietMode.data.museum.status, 'quiet');
    assert.equal(enableQuietMode.data.museum.quietMode, true);

    const archiveSharedMuseum = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/status`, {
      method: 'POST',
      body: {
        status: 'archived',
      },
    });
    assert.equal(archiveSharedMuseum.response.status, 200);
    assert.equal(archiveSharedMuseum.data.museum.status, 'archived');
    assert.equal(archiveSharedMuseum.data.museum.inviteEnabled, false);
    assert.equal(archiveSharedMuseum.data.museum.quietMode, true);

    const addItemToArchivedSharedMuseum = await user.request(baseUrl, `/api/shared-museums/${sharedMuseumId}/items`, {
      method: 'POST',
      body: {
        sourceItemId: createItem.data.item.id,
      },
    });
    assert.equal(addItemToArchivedSharedMuseum.response.status, 409);

    const createEndedSharedMuseum = await user.request(baseUrl, '/api/shared-museums', {
      method: 'POST',
      body: {
        name: 'Ended Shared Museum',
        description: 'Closure flow check.',
        theme: 'shared-memory',
      },
    });
    assert.equal(createEndedSharedMuseum.response.status, 200);
    const endedSharedMuseumId = createEndedSharedMuseum.data.museum.id as string;

    const joinEndedSharedMuseum = await partner.request(baseUrl, '/api/shared-museums/join', {
      method: 'POST',
      body: {
        inviteCode: createEndedSharedMuseum.data.museum.inviteCode,
      },
    });
    assert.equal(joinEndedSharedMuseum.response.status, 200);

    const endSharedMuseum = await user.request(baseUrl, `/api/shared-museums/${endedSharedMuseumId}/status`, {
      method: 'POST',
      body: {
        status: 'ended',
      },
    });
    assert.equal(endSharedMuseum.response.status, 200);
    assert.equal(endSharedMuseum.data.museum.status, 'ended');
    assert.equal(endSharedMuseum.data.museum.inviteEnabled, false);

    const partnerLeaveEndedSharedMuseum = await partner.request(baseUrl, `/api/shared-museums/${endedSharedMuseumId}/leave`, {
      method: 'POST',
    });
    assert.equal(partnerLeaveEndedSharedMuseum.response.status, 200);
    assert.equal(partnerLeaveEndedSharedMuseum.data.success, true);

    const generateEmojiPack = await user.request(baseUrl, '/api/ai/generate-emoji-pack', {
      method: 'POST',
      body: {
        itemIds: [createItem.data.item.id],
        count: 1,
        userMood: 'launch test mood',
        stylePreset: undefined,
      },
    });
    assert.equal(generateEmojiPack.response.status, 200);
    assert.equal(Array.isArray(generateEmojiPack.data.items), true);
    assert.equal(generateEmojiPack.data.items.length, 1);
    assert.match(generateEmojiPack.data.items[0].imageUrl, /^\/api\/uploads\//);

    const emojiAsset = await fetch(`${baseUrl}${generateEmojiPack.data.items[0].imageUrl}`, {
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    });
    assert.equal(emojiAsset.status, 200);
    assert.match(emojiAsset.headers.get('content-type') || '', /^image\//);

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
        query: 'How should launch users ask about their saved memories?',
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
