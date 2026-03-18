import { sendExternalAlert } from './externalAlerting.ts';

type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const serialized = JSON.stringify(payload);

  if (level === 'error') {
    console.error(serialized);
    sendExternalAlert('error', message, context);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    sendExternalAlert('warn', message, context);
    return;
  }

  console.log(serialized);
}

export const serverLogger = {
  info(message: string, context?: Record<string, unknown>) {
    emit('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    emit('warn', message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    emit('error', message, context);
  },
};
