import { getAccessToken } from './apiClient';

type ClientErrorSource = 'error-boundary' | 'window.error' | 'unhandledrejection' | 'manual';

interface ClientErrorPayload {
  source: ClientErrorSource;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  extra?: Record<string, unknown>;
}

const reportCooldown = new Map<string, number>();
let globalHandlersRegistered = false;

function sanitizeClientValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'string') {
    return value.length > 1500 ? `${value.slice(0, 1500)}...` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? sanitizeClientValue(value.stack) : null,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map(sanitizeClientValue);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 20).map(([key, entry]) => [key, sanitizeClientValue(entry)]),
    );
  }

  return String(value);
}

function shouldReport(message: string, source: ClientErrorSource) {
  const fingerprint = `${source}:${message}`;
  const now = Date.now();
  const expiresAt = reportCooldown.get(fingerprint);
  if (expiresAt && expiresAt > now) {
    return false;
  }

  reportCooldown.set(fingerprint, now + 30_000);
  return true;
}

export function reportClientError(payload: ClientErrorPayload) {
  if (typeof window === 'undefined' || !payload.message.trim() || !shouldReport(payload.message, payload.source)) {
    return;
  }

  const requestBody = JSON.stringify({
    source: payload.source,
    message: payload.message,
    stack: payload.stack || null,
    componentStack: payload.componentStack || null,
    href: window.location.href,
    userAgent: navigator.userAgent,
    extra: sanitizeClientValue(payload.extra || {}),
  });

  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([requestBody], { type: 'application/json' });
      const accepted = navigator.sendBeacon('/api/client-errors', blob);
      if (accepted) {
        return;
      }
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch('/api/client-errors', {
    method: 'POST',
    headers,
    credentials: 'include',
    body: requestBody,
    keepalive: true,
  }).catch(() => {
    // Swallow client reporting failures.
  });
}

export function registerGlobalClientErrorHandlers() {
  if (globalHandlersRegistered || typeof window === 'undefined') {
    return;
  }

  globalHandlersRegistered = true;

  window.addEventListener('error', (event) => {
    const message = event.error instanceof Error
      ? event.error.message
      : event.message || '\u6d4f\u89c8\u5668\u8fd0\u884c\u65f6\u51fa\u73b0\u672a\u77e5\u9519\u8bef';

    reportClientError({
      source: 'window.error',
      message,
      stack: event.error instanceof Error ? event.error.stack || null : null,
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : '\u672a\u5904\u7406\u7684 Promise \u5f02\u5e38';

    reportClientError({
      source: 'unhandledrejection',
      message,
      stack: reason instanceof Error ? reason.stack || null : null,
      extra: {
        reason: sanitizeClientValue(reason),
      },
    });
  });
}
