import { recordTestMailboxEntry } from './testMailbox.ts';

export type MailDeliveryMode = 'resend' | 'log';

export interface MailDispatchResult {
  mode: MailDeliveryMode;
  previewUrl?: string;
}

interface EmailContent {
  to: string;
  subject: string;
  text: string;
  html: string;
  previewUrl?: string;
}

interface VerificationEmailInput {
  to: string;
  nickname: string;
  appBaseUrl: string;
  token: string;
}

interface PasswordResetEmailInput {
  to: string;
  nickname: string;
  appBaseUrl: string;
  token: string;
}

const DEFAULT_FROM_EMAIL = 'no-reply@re-museum.local';
const DEFAULT_FROM_NAME = 'Re-Museum';

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<MailDispatchResult> {
  const actionUrl = buildAuthActionUrl(input.appBaseUrl, 'verify-email', input.token);

  return sendEmail({
    to: input.to,
    subject: '请验证你的 Re-Museum 邮箱',
    text: [
      `${input.nickname}，你好：`,
      '',
      '请打开下方链接，完成 Re-Museum 邮箱验证：',
      actionUrl,
      '',
      '该链接将在 24 小时后失效。',
      '',
      '如果这不是你的操作，可以直接忽略这封邮件。',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #171717;">
        <p>${escapeHtml(input.nickname)}，你好：</p>
        <p>请点击下方按钮，完成 Re-Museum 邮箱验证。</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapeHtml(actionUrl)}"
            style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #d97706; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            验证邮箱
          </a>
        </p>
        <p>如果按钮无法打开，请将下面的链接复制到浏览器中访问：</p>
        <p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>
        <p>该链接将在 24 小时后失效。</p>
        <p>如果这不是你的操作，可以直接忽略这封邮件。</p>
      </div>
    `,
    previewUrl: actionUrl,
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<MailDispatchResult> {
  const actionUrl = buildAuthActionUrl(input.appBaseUrl, 'reset-password', input.token);

  return sendEmail({
    to: input.to,
    subject: '重置你的 Re-Museum 密码',
    text: [
      `${input.nickname}，你好：`,
      '',
      '我们收到了一次 Re-Museum 密码重置请求。',
      '请打开下方链接重新设置密码：',
      actionUrl,
      '',
      '该链接将在 60 分钟后失效。',
      '',
      '如果这不是你的操作，可以直接忽略这封邮件。',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #171717;">
        <p>${escapeHtml(input.nickname)}，你好：</p>
        <p>我们收到了一次 Re-Museum 密码重置请求。</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapeHtml(actionUrl)}"
            style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            重置密码
          </a>
        </p>
        <p>如果按钮无法打开，请将下面的链接复制到浏览器中访问：</p>
        <p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>
        <p>该链接将在 60 分钟后失效。</p>
        <p>如果这不是你的操作，可以直接忽略这封邮件。</p>
      </div>
    `,
    previewUrl: actionUrl,
  });
}

export function resolveAppBaseUrl(requestOrigin?: string): string {
  const configured = normalizeBaseUrl(process.env.APP_BASE_URL);
  if (configured) {
    return configured;
  }

  const requestBased = normalizeBaseUrl(requestOrigin);
  if (requestBased) {
    return requestBased;
  }

  throw new Error('\u5f53\u8bf7\u6c42\u6765\u6e90\u4e0d\u53ef\u7528\u65f6\uff0c\u5fc5\u987b\u914d\u7f6e APP_BASE_URL\u3002');
}

function buildAuthActionUrl(baseUrl: string, action: 'verify-email' | 'reset-password', token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('auth_action', action);
  url.searchParams.set('token', token);
  return url.toString();
}

async function sendEmail(input: EmailContent): Promise<MailDispatchResult> {
  const mode = resolveMailDeliveryMode();
  if (mode === 'log') {
    if (process.env.NODE_ENV === 'test') {
      recordTestMailboxEntry({
        to: input.to,
        subject: input.subject,
        text: input.text,
        previewUrl: input.previewUrl,
      });
    }

    console.info(
      '[mailer:log]',
      JSON.stringify(
        {
          to: input.to,
          subject: input.subject,
          previewUrl: input.previewUrl,
          text: input.text,
        },
        null,
        2,
      ),
    );
    return { mode, previewUrl: input.previewUrl };
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.MAIL_FROM_EMAIL?.trim();
  if (!resendApiKey || !fromEmail) {
    throw new Error('EMAIL_DELIVERY_MODE=resend \u65f6\uff0c\u5fc5\u987b\u540c\u65f6\u914d\u7f6e RESEND_API_KEY \u548c MAIL_FROM_EMAIL\u3002');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: formatSender(fromEmail),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(`Resend 邮件接口请求失败，状态码 ${response.status}：${responseText}`);
  }

  return { mode };
}

export function resolveMailDeliveryMode(): MailDeliveryMode {
  const configuredMode = process.env.EMAIL_DELIVERY_MODE?.trim().toLowerCase();
  if (configuredMode === 'resend') {
    return 'resend';
  }

  if (configuredMode === 'log') {
    return 'log';
  }

  return process.env.RESEND_API_KEY ? 'resend' : 'log';
}

export function isLiveMailDeliveryEnabled(): boolean {
  return resolveMailDeliveryMode() === 'resend';
}

function formatSender(fromEmail: string): string {
  const fromName = process.env.MAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  return `${fromName} <${fromEmail}>`;
}

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.trim().replace(/\/+$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

if (process.env.NODE_ENV === 'production' && resolveMailDeliveryMode() === 'log') {
  console.warn(
    '[mailer] 当前邮件发送仍处于日志模式；如需真实发信，请配置 EMAIL_DELIVERY_MODE=resend、RESEND_API_KEY、MAIL_FROM_EMAIL 和 APP_BASE_URL。',
  );
}

if (!process.env.MAIL_FROM_EMAIL?.trim() && resolveMailDeliveryMode() === 'log') {
  process.env.MAIL_FROM_EMAIL = DEFAULT_FROM_EMAIL;
}
