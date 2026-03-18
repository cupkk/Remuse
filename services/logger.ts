import { reportClientError } from './clientErrorReporter';

const meta = import.meta as unknown as { env?: { DEV?: boolean } };
const isDev = meta.env?.DEV ?? true;

const noop = (..._args: unknown[]) => {};

function toMessage(args: unknown[]) {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.message;
      }

      if (typeof arg === 'string') {
        return arg;
      }

      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function toStack(args: unknown[]) {
  const errorArg = args.find((arg) => arg instanceof Error);
  return errorArg instanceof Error ? errorArg.stack || null : null;
}

const logger = {
  info: isDev ? (...args: unknown[]) => console.log('[REMUSE]', ...args) : noop,
  warn: isDev ? (...args: unknown[]) => console.warn('[REMUSE]', ...args) : noop,
  error: (...args: unknown[]) => {
    if (isDev) {
      console.error('[REMUSE]', ...args);
    }

    reportClientError({
      source: 'manual',
      message: toMessage(args) || 'Unknown client error',
      stack: toStack(args),
      extra: {
        args: args.map((arg) => (arg instanceof Error ? { name: arg.name, message: arg.message } : String(arg))),
      },
    });
  },
  debug: isDev ? (...args: unknown[]) => console.debug('[REMUSE]', ...args) : noop,
};

export default logger;
