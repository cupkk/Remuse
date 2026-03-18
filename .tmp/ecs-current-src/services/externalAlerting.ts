import { APP_CONFIG } from './appConfig.ts';

type AlertLevel = 'warn' | 'error';

interface AlertPayload {
  timestamp: string;
  environment: string;
  level: AlertLevel;
  message: string;
  source: string;
  context: Record<string, unknown>;
}

const alertCooldown = new Map<string, number>();

function buildAlertFingerprint(level: AlertLevel, message: string, context: Record<string, unknown>) {
  return `${level}:${message}:${String(context.path || '')}:${String(context.requestId || '')}:${String(context.category || '')}`;
}

function pruneCooldownCache(now: number) {
  for (const [key, expiresAt] of alertCooldown.entries()) {
    if (expiresAt <= now) {
      alertCooldown.delete(key);
    }
  }
}

function shouldSendAlert(level: AlertLevel, message: string, context: Record<string, unknown>) {
  if (!APP_CONFIG.errorAlertWebhookUrl) {
    return false;
  }

  if (level === 'warn' && !APP_CONFIG.errorAlertIncludeWarn) {
    return false;
  }

  const now = Date.now();
  pruneCooldownCache(now);

  const fingerprint = buildAlertFingerprint(level, message, context);
  const existingExpiry = alertCooldown.get(fingerprint);
  if (existingExpiry && existingExpiry > now) {
    return false;
  }

  alertCooldown.set(fingerprint, now + APP_CONFIG.errorAlertCooldownMs);
  return true;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return value.length > 1500 ? `${value.slice(0, 1500)}…` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? sanitizeValue(value.stack) : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeValue);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, sanitizeValue(entryValue)]));
  }

  return String(value);
}

function formatPlainText(payload: AlertPayload) {
  const lines = [
    `[${payload.source}] ${payload.level.toUpperCase()} ${payload.message}`,
    `environment: ${payload.environment}`,
    `time: ${payload.timestamp}`,
  ];

  const sanitizedContext = sanitizeValue(payload.context);
  if (sanitizedContext && typeof sanitizedContext === 'object' && Object.keys(sanitizedContext as Record<string, unknown>).length > 0) {
    lines.push(`context: ${JSON.stringify(sanitizedContext, null, 2)}`);
  }

  return lines.join('\n');
}

function createWebhookRequest(webhookUrl: string, payload: AlertPayload) {
  const plainText = formatPlainText(payload);

  if (webhookUrl.includes('hooks.slack.com')) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: plainText }),
    };
  }

  if (webhookUrl.includes('discord.com/api/webhooks')) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: plainText }),
    };
  }

  if (webhookUrl.includes('open.feishu.cn') || webhookUrl.includes('open.larksuite.com')) {
    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'text',
        content: {
          text: plainText,
        },
      }),
    };
  }

  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      context: sanitizeValue(payload.context),
      text: plainText,
    }),
  };
}

export function sendExternalAlert(level: AlertLevel, message: string, context: Record<string, unknown> = {}) {
  if (!shouldSendAlert(level, message, context)) {
    return;
  }

  const webhookUrl = APP_CONFIG.errorAlertWebhookUrl!;
  const payload: AlertPayload = {
    timestamp: new Date().toISOString(),
    environment: APP_CONFIG.alertEnvironment,
    level,
    message,
    source: 're-museum',
    context,
  };

  const request = createWebhookRequest(webhookUrl, payload);

  void fetch(webhookUrl, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(8_000),
  }).catch((error) => {
    process.stderr.write(`[REMUSE][external-alert] ${error instanceof Error ? error.message : String(error)}\n`);
  });
}
