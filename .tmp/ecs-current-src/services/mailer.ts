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
    subject: 'Verify your Re-Museum email',
    text: [
      `Hi ${input.nickname},`,
      '',
      'Please verify your Re-Museum email address by opening the link below:',
      actionUrl,
      '',
      'The link expires in 24 hours.',
      '',
      'If you did not create this account, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #171717;">
        <p>Hi ${escapeHtml(input.nickname)},</p>
        <p>Please verify your Re-Museum email address by clicking the button below.</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapeHtml(actionUrl)}"
            style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #d97706; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Verify Email
          </a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>
        <p>The link expires in 24 hours.</p>
        <p>If you did not create this account, you can ignore this email.</p>
      </div>
    `,
    previewUrl: actionUrl,
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<MailDispatchResult> {
  const actionUrl = buildAuthActionUrl(input.appBaseUrl, 'reset-password', input.token);

  return sendEmail({
    to: input.to,
    subject: 'Reset your Re-Museum password',
    text: [
      `Hi ${input.nickname},`,
      '',
      'We received a request to reset your Re-Museum password.',
      'Open the link below to choose a new password:',
      actionUrl,
      '',
      'The link expires in 60 minutes.',
      '',
      'If you did not request this change, you can ignore this email.',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #171717;">
        <p>Hi ${escapeHtml(input.nickname)},</p>
        <p>We received a request to reset your Re-Museum password.</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapeHtml(actionUrl)}"
            style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 700;"
          >
            Reset Password
          </a>
        </p>
        <p>If the button does not work, copy and paste this link into your browser:</p>
        <p><a href="${escapeHtml(actionUrl)}">${escapeHtml(actionUrl)}</a></p>
        <p>The link expires in 60 minutes.</p>
        <p>If you did not request this change, you can ignore this email.</p>
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

  throw new Error('APP_BASE_URL is required when the request origin is unavailable.');
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
    throw new Error('RESEND_API_KEY and MAIL_FROM_EMAIL are required when EMAIL_DELIVERY_MODE=resend.');
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
    throw new Error(`Resend API request failed with status ${response.status}: ${responseText}`);
  }

  return { mode };
}

function resolveMailDeliveryMode(): MailDeliveryMode {
  const configuredMode = process.env.EMAIL_DELIVERY_MODE?.trim().toLowerCase();
  if (configuredMode === 'resend') {
    return 'resend';
  }

  if (configuredMode === 'log') {
    return 'log';
  }

  return process.env.RESEND_API_KEY ? 'resend' : 'log';
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
    '[mailer] Email delivery is running in log mode. Set EMAIL_DELIVERY_MODE=resend, RESEND_API_KEY, MAIL_FROM_EMAIL, and APP_BASE_URL for real emails.',
  );
}

if (!process.env.MAIL_FROM_EMAIL?.trim() && resolveMailDeliveryMode() === 'log') {
  process.env.MAIL_FROM_EMAIL = DEFAULT_FROM_EMAIL;
}
