import path from 'node:path';
import { LEGAL_VERSION_SNAPSHOT } from './legalDocuments.ts';

function normalizeUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  return value.trim().replace(/\/+$/, '');
}

function parseInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseCommaSeparatedList(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const APP_ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const APP_CONFIG = {
  appRoot: APP_ROOT,
  isProduction: IS_PRODUCTION,
  appBaseUrl: normalizeUrl(process.env.APP_BASE_URL),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
  geminiBaseUrl: normalizeUrl(process.env.GEMINI_BASE_URL)
    || (IS_PRODUCTION ? null : 'https://cdn.12ai.org'),
  geminiFallbackBaseUrls: parseCommaSeparatedList(process.env.GEMINI_FALLBACK_BASE_URLS).map((url) => normalizeUrl(url) || '').filter(Boolean),
  allowThirdPartyGeminiProxy: parseBoolean(process.env.ALLOW_THIRD_PARTY_GEMINI_PROXY),
  disableLiveAi: parseBoolean(process.env.DISABLE_LIVE_AI, process.env.NODE_ENV === 'test'),
  adminEmailAllowlist: new Set(parseCommaSeparatedList(process.env.ADMIN_EMAIL_ALLOWLIST).map((entry) => entry.toLowerCase())),
  dailyGeminiCalls: parseInteger(process.env.DAILY_GEMINI_CALL_LIMIT, 40),
  dailyMemoryQueries: parseInteger(process.env.DAILY_MEMORY_QUERY_LIMIT, 24),
  backupDir: path.resolve(process.env.BACKUP_DIR || path.join(APP_ROOT, 'backups')),
  errorAlertWebhookUrl: normalizeUrl(process.env.ERROR_ALERT_WEBHOOK_URL),
  errorAlertIncludeWarn: parseBoolean(process.env.ERROR_ALERT_INCLUDE_WARN),
  errorAlertCooldownMs: parseInteger(process.env.ERROR_ALERT_COOLDOWN_MS, 60_000),
  alertEnvironment: process.env.ALERT_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
  supportContactLabel: process.env.SUPPORT_CONTACT_LABEL?.trim() || '微信',
  supportContactValue: process.env.SUPPORT_CONTACT_VALUE?.trim() || 'MTtin999',
  enableRembg: parseBoolean(process.env.ENABLE_REMBG),
  rembgCommand: process.env.REMBG_COMMAND?.trim() || 'rembg',
  rembgModel: process.env.REMBG_MODEL?.trim() || 'u2netp',
  rembgModelHome: process.env.REMBG_MODEL_HOME?.trim() || '',
  rembgTimeoutMs: parseInteger(process.env.REMBG_TIMEOUT_MS, 20_000),
  legalVersions: LEGAL_VERSION_SNAPSHOT,
} as const;

export function validateAppConfig() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16) {
    throw new Error('JWT_SECRET is required and must be at least 16 characters long.');
  }

  if (!APP_CONFIG.geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required.');
  }

  if (APP_CONFIG.isProduction) {
    if (!APP_CONFIG.appBaseUrl) {
      throw new Error('APP_BASE_URL is required in production.');
    }

    if (!APP_CONFIG.geminiBaseUrl) {
      throw new Error('GEMINI_BASE_URL must be explicitly configured in production.');
    }

    if (!APP_CONFIG.allowThirdPartyGeminiProxy && APP_CONFIG.geminiBaseUrl.includes('12ai.org')) {
      throw new Error('Third-party 12ai Gemini endpoints are not allowed in production.');
    }

    if (
      !APP_CONFIG.allowThirdPartyGeminiProxy
      && APP_CONFIG.geminiFallbackBaseUrls.some((url) => url.includes('12ai.org'))
    ) {
      throw new Error('Third-party 12ai Gemini fallback endpoints are not allowed in production.');
    }
  }

  const emailDeliveryMode = (process.env.EMAIL_DELIVERY_MODE || '').trim().toLowerCase();
  if (emailDeliveryMode === 'resend') {
    if (!APP_CONFIG.appBaseUrl) {
      throw new Error('APP_BASE_URL is required when EMAIL_DELIVERY_MODE=resend.');
    }

    if (!process.env.RESEND_API_KEY?.trim()) {
      throw new Error('RESEND_API_KEY is required when EMAIL_DELIVERY_MODE=resend.');
    }

    if (!process.env.MAIL_FROM_EMAIL?.trim()) {
      throw new Error('MAIL_FROM_EMAIL is required when EMAIL_DELIVERY_MODE=resend.');
    }
  }
}
