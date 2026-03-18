import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RETRY_PREFIX = 'remuse:chunk-retry:';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || '');
}

export function isDynamicImportChunkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('loading chunk') ||
    message.includes('chunkloaderror')
  );
}

export function lazyWithChunkRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
  chunkKey: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await loader();
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(`${RETRY_PREFIX}${chunkKey}`);
      }
      return module;
    } catch (error) {
      if (typeof window !== 'undefined' && isDynamicImportChunkError(error)) {
        const retryKey = `${RETRY_PREFIX}${chunkKey}`;
        const hasRetried = window.sessionStorage.getItem(retryKey) === '1';

        if (!hasRetried) {
          window.sessionStorage.setItem(retryKey, '1');
          window.location.reload();
          return new Promise<never>(() => {});
        }

        window.sessionStorage.removeItem(retryKey);
      }

      throw error;
    }
  });
}
