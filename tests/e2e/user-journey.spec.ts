import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const TEST_API_BASE_URL = 'http://127.0.0.1:4300';
const TEST_IMAGE_PATH = path.resolve(process.cwd(), 'assets/qr/poster-qr-remuse-top.png');

test.describe.configure({ mode: 'serial' });

test('registered user can verify email, login, scan, archive, generate sticker, query memory, and logout', async ({
  page,
  request,
}) => {
  const email = `playwright.${Date.now()}@example.com`;
  const password = 'Password123!';
  const memoryPrompt = '请根据我刚刚归档的旧物整理一段记忆摘要';

  await clearMailbox(request);

  await page.goto('/');
  await skipLaunchIfPresent(page);
  await waitForAuthScreen(page);

  await page.getByRole('button', { name: '注册' }).click();
  await page.getByTestId('auth-nickname-input').fill('Playwright User');
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-register-password-input').fill(password);
  await page.getByTestId('auth-accept-policies').check();
  await page.getByTestId('auth-submit-register').click();

  await skipOnboardingIfPresent(page);
  await expect(page.getByTestId('curator-logout')).toBeVisible();

  const verifyUrl = await waitForMailboxPreviewUrl(request, email, 'verify');
  const verifyToken = new URL(verifyUrl).searchParams.get('token');
  expect(verifyToken).toBeTruthy();

  const verifyResponse = await request.post(`${TEST_API_BASE_URL}/api/auth/verify-email`, {
    data: { token: verifyToken },
  });
  expect(verifyResponse.ok()).toBeTruthy();

  await page.reload();
  await loginIfNeeded(page, email, password);

  if (!(await page.getByTestId('scanner-open-upload').isVisible().catch(() => false))) {
    await page.getByTestId('desktop-nav-scanner').click();
    await expect(page.getByTestId('scanner-open-upload')).toBeVisible();
  }

  await page.getByTestId('scanner-upload-input').setInputFiles({
    name: 'scan.png',
    mimeType: 'image/png',
    buffer: await import('node:fs/promises').then((fs) => fs.readFile(TEST_IMAGE_PATH)),
  });

  await expect(page.getByText('归档成功')).toBeVisible({ timeout: 30_000 });

  const createStickerResponse = page.waitForResponse((response) => (
    response.url().includes('/api/stickers')
    && response.request().method() === 'POST'
    && response.ok()
  ));

  await page.getByTestId('scanner-generate-sticker').click();
  await createStickerResponse;
  await expect(page.getByTestId('scanner-view-sticker')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('NEW STICKER')).toBeVisible();

  await page.getByTestId('scanner-go-to-hall').click();
  await expect(page.getByTestId('museum-gallery')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('desktop-nav-workshop').click();
  await expect(page.getByTestId('workshop-home')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('workshop-open-emoji-pack')).toBeVisible();

  await page.getByTestId('desktop-nav-memory').click();
  await expect(page.getByTestId('memory-query-input')).toBeVisible();

  const queryResponse = page.waitForResponse((response) => (
    response.url().includes('/api/memory/threads/')
    && response.url().includes('/query')
    && response.request().method() === 'POST'
    && response.ok()
  ));

  await page.getByTestId('memory-query-input').fill(memoryPrompt);
  await page.getByTestId('memory-send-query').click();
  await queryResponse;

  await expect(page.getByTestId('memory-message-user').filter({ hasText: memoryPrompt })).toBeVisible();
  await expect.poll(async () => page.getByTestId('memory-message-assistant').count()).toBeGreaterThan(1);

  await page.getByTestId('desktop-nav-profile').click();
  await page.getByTestId('curator-logout').click();
  await waitForAuthScreen(page);
});

async function waitForAuthScreen(page: Page) {
  await expect(page.getByTestId('auth-submit-login')).toBeVisible({ timeout: 20_000 });
}

async function loginIfNeeded(page: Page, email: string, password: string) {
  const logoutButton = page.getByTestId('curator-logout');
  const scannerUploadButton = page.getByTestId('scanner-open-upload');
  if (await logoutButton.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) {
    return;
  }
  if (await scannerUploadButton.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) {
    return;
  }

  await waitForAuthScreen(page);
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-login-password-input').fill(password);
  await page.getByTestId('auth-submit-login').click();
  await Promise.race([
    logoutButton.waitFor({ state: 'visible', timeout: 20_000 }),
    scannerUploadButton.waitFor({ state: 'visible', timeout: 20_000 }),
  ]);
}

async function skipLaunchIfPresent(page: Page) {
  const skipButton = page.getByLabel('点击跳过启动动画');
  if (await skipButton.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) {
    await skipButton.click();
  }
}

async function skipOnboardingIfPresent(page: Page) {
  const skipButton = page.getByRole('button', { name: /SKIP/i });
  if (await skipButton.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) {
    await skipButton.click();
    await page.waitForTimeout(700);
  }
}

async function clearMailbox(request: APIRequestContext) {
  const response = await request.delete(`${TEST_API_BASE_URL}/api/test/mailbox`);
  expect(response.ok()).toBeTruthy();
}

async function waitForMailboxPreviewUrl(
  request: APIRequestContext,
  email: string,
  subject: string,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.get(
      `${TEST_API_BASE_URL}/api/test/mailbox?email=${encodeURIComponent(email)}&subject=${encodeURIComponent(subject)}`,
    );
    expect(response.ok()).toBeTruthy();

    const data = await response.json() as {
      entries: Array<{ previewUrl?: string }>;
    };

    const previewUrl = data.entries[0]?.previewUrl;
    if (previewUrl) {
      return previewUrl;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for mailbox preview for ${email}`);
}
