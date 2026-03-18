import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { Agent } from 'undici';
import 'dotenv/config';

import { adminMiddleware } from './middleware/adminMiddleware.ts';
import { assetAuthMiddleware, authMiddleware } from './middleware/authMiddleware.ts';
import adminRouter from './routes/admin.ts';
import aiRouter from './routes/ai.ts';
import authRouter from './routes/auth.ts';
import clientErrorsRouter from './routes/clientErrors.ts';
import feedbackRouter from './routes/feedback.ts';
import hallsRouter from './routes/halls.ts';
import itemsRouter from './routes/items.ts';
import memoryRouter from './routes/memory.ts';
import stickersRouter from './routes/stickers.ts';
import testRouter from './routes/test.ts';
import transformationGuidesRouter from './routes/transformationGuides.ts';
import { APP_CONFIG, APP_ROOT, validateAppConfig } from './services/appConfig.ts';
import { getManagedUploadInfo, UPLOADS_DIR } from './services/storage.ts';
import { recordAiUsageEvent, assertWithinUsageQuota } from './services/usageQuota.ts';
import { getAllLegalDocuments } from './services/legalDocuments.ts';
import { serverLogger } from './services/serverLogger.ts';
import './services/database.ts';
import './services/userGovernance.ts';
import './services/memoryThreadStore.ts';
import './services/feedbackStore.ts';

const DIST_DIR = path.resolve(APP_ROOT, 'dist');
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || (APP_CONFIG.isProduction ? '127.0.0.1' : '0.0.0.0');
const geminiDispatcher = new Agent({
  connect: { timeout: 30_000 },
});
const execFileAsync = promisify(execFile);

validateAppConfig();

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down and try again shortly.' },
  });

  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please try again in a few minutes.' },
  });

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use((req, res, next) => {
    applySecurityHeaders(req, res);
    next();
  });
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      serverLogger.info('request.completed', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  app.get('/api/healthz', (_req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      uploadsDir: UPLOADS_DIR,
      appBaseUrlConfigured: !!APP_CONFIG.appBaseUrl,
      backupDir: APP_CONFIG.backupDir,
    });
  });

  app.get('/api/legal', (_req, res) => {
    res.json({
      documents: getAllLegalDocuments(),
    });
  });

  app.use(
    '/api/gemini',
    aiLimiter,
    authMiddleware,
    express.json({ limit: '20mb' }),
    async (req, res) => {
      const startedAt = Date.now();

      const quota = assertWithinUsageQuota(req.userId!, 'gemini-proxy');
      if (!quota.allowed) {
        res.status(429).json({
          error: 'Daily AI generation quota exceeded.',
          usage: quota,
        });
        return;
      }

      if (APP_CONFIG.disableLiveAi) {
        recordAiUsageEvent({
          userId: req.userId!,
          scope: 'gemini-proxy',
          model: extractGeminiModelFromUrl(req.url || ''),
          success: false,
          durationMs: Date.now() - startedAt,
          details: { disabled: true },
        });
        res.status(503).json({
          error: {
            code: 503,
            message: 'Live AI is disabled in this environment.',
          },
        });
        return;
      }

      let lastError: any = null;
      let lastUpstream = '';
      let success = false;
      const model = extractGeminiModelFromUrl(req.url || '');

      for (const targetUrl of buildGeminiTargetUrls(req.url || '/')) {
        lastUpstream = `${targetUrl.origin}${targetUrl.pathname}`;

        try {
          targetUrl.searchParams.delete('key');
          targetUrl.searchParams.set('key', APP_CONFIG.geminiApiKey);

          const upstreamRes = await fetch(targetUrl.href, {
            method: req.method,
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': APP_CONFIG.geminiApiKey,
            },
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
            signal: AbortSignal.timeout(120_000),
            dispatcher: geminiDispatcher,
          } as any);

          const data = await upstreamRes.text();
          success = upstreamRes.ok;
          recordAiUsageEvent({
            userId: req.userId!,
            scope: 'gemini-proxy',
            model,
            success,
            durationMs: Date.now() - startedAt,
            details: {
              upstream: lastUpstream,
              statusCode: upstreamRes.status,
            },
          });
          res.status(upstreamRes.status).type('application/json').send(data);
          return;
        } catch (error: any) {
          lastError = error;

          if (res.headersSent) {
            return;
          }

          if (isGeminiConnectTimeout(error)) {
            try {
              const curlResponse = await proxyGeminiWithCurl(targetUrl, req.method, req.body);
              success = curlResponse.statusCode >= 200 && curlResponse.statusCode < 300;
              recordAiUsageEvent({
                userId: req.userId!,
                scope: 'gemini-proxy',
                model,
                success,
                durationMs: Date.now() - startedAt,
                details: {
                  upstream: lastUpstream,
                  statusCode: curlResponse.statusCode,
                  transport: 'curl-fallback',
                },
              });
              res.status(curlResponse.statusCode).type('application/json').send(curlResponse.body);
              return;
            } catch (curlError: any) {
              serverLogger.error('gemini.curl_fallback_failed', {
                upstream: lastUpstream,
                message: curlError?.message,
                code: curlError?.code,
              });
            }
          }

          serverLogger.warn('gemini.upstream_failed', {
            upstream: lastUpstream,
            message: error?.message,
          });
        }
      }

      recordAiUsageEvent({
        userId: req.userId!,
        scope: 'gemini-proxy',
        model,
        success: false,
        durationMs: Date.now() - startedAt,
        details: {
          upstream: lastUpstream,
          error: lastError?.message || 'Unknown upstream error',
        },
      });

      const isTimeout = lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError';
      res.status(isTimeout ? 504 : 502).json({
        error: {
          code: isTimeout ? 504 : 502,
          message: `Proxy error: ${lastError?.message || 'Unable to reach Gemini upstream'}`,
          upstream: lastUpstream,
        },
      });
    },
  );

  app.use('/api/auth', authRouter);
  app.use('/api/client-errors', apiLimiter, clientErrorsRouter);
  app.use('/api/ai', aiLimiter, authMiddleware, aiRouter);
  app.use('/api/items', apiLimiter, authMiddleware, itemsRouter);
  app.use('/api/stickers', apiLimiter, authMiddleware, stickersRouter);
  app.use('/api/transformation-guides', apiLimiter, authMiddleware, transformationGuidesRouter);
  app.use('/api/halls', apiLimiter, authMiddleware, hallsRouter);
  app.use('/api/memory', aiLimiter, authMiddleware, memoryRouter);
  app.use('/api/feedback', apiLimiter, authMiddleware, feedbackRouter);
  app.use('/api/admin', apiLimiter, authMiddleware, adminMiddleware, adminRouter);

  if (process.env.NODE_ENV === 'test') {
    app.use('/api/test', testRouter);
  }

  app.get(/^\/api\/uploads\/(.+)/, assetAuthMiddleware, (req, res) => {
    const internalUploadPath = req.path.replace(/^\/api/, '');
    const uploadInfo = getManagedUploadInfo(internalUploadPath);

    if (!uploadInfo) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    if (uploadInfo.userId !== req.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (!fs.existsSync(uploadInfo.absolutePath)) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
    res.sendFile(uploadInfo.absolutePath);
  });

  app.use(
    express.static(DIST_DIR, {
      immutable: true,
      maxAge: '7d',
      setHeaders: (res, servedPath) => {
        if (servedPath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      next();
      return;
    }

    const acceptHeader = req.headers.accept || '';
    const wantsHtml = acceptHeader.includes('text/html') || acceptHeader.includes('*/*');
    const hasFileExtension = path.extname(req.path) !== '';

    if (!wantsHtml || hasFileExtension) {
      next();
      return;
    }

    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    serverLogger.error('request.unhandled_error', {
      method: req.method,
      path: req.originalUrl,
      userId: req.userId || null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack || null : null,
    });

    if (res.headersSent) {
      return;
    }

    res.status(500).json({ error: 'Internal server error.' });
  });

  app.use((req, res) => {
    if (path.extname(req.path)) {
      res.status(404).type('text/plain').send('Not found');
      return;
    }

    res.status(404).type('text/plain').send('Not found');
  });

  return app;
}

export function startServer() {
  const app = createApp();
  return app.listen(PORT, HOST, () => {
    serverLogger.info('server.started', {
      host: HOST,
      port: PORT,
      appRoot: APP_ROOT,
      uploadsDir: UPLOADS_DIR,
      geminiBaseUrl: APP_CONFIG.geminiBaseUrl,
      geminiFallbackBaseUrls: APP_CONFIG.geminiFallbackBaseUrls,
    });
  });
}

function registerProcessErrorHooks() {
  process.on('unhandledRejection', (reason) => {
    serverLogger.error('process.unhandled_rejection', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack || null,
      } : String(reason),
    });
  });

  process.on('uncaughtException', (error) => {
    serverLogger.error('process.uncaught_exception', {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
    });

    setTimeout(() => process.exit(1), 250);
  });
}

function isGeminiConnectTimeout(error: any): boolean {
  return (
    error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    error?.cause?.name === 'ConnectTimeoutError'
  );
}

async function proxyGeminiWithCurl(
  targetUrl: URL,
  method: string,
  body: unknown,
): Promise<{ statusCode: number; body: string }> {
  const args = [
    '-sS',
    '-L',
    '-X',
    method,
    targetUrl.href,
    '-H',
    'Content-Type: application/json',
    '-H',
    `x-goog-api-key: ${APP_CONFIG.geminiApiKey}`,
    '--connect-timeout',
    '30',
    '--max-time',
    '120',
    '-w',
    '\n%{http_code}',
  ];

  if (!['GET', 'HEAD'].includes(method)) {
    args.push('--data', JSON.stringify(body ?? {}));
  }

  const { stdout } = await execFileAsync('curl', args, {
    maxBuffer: 20 * 1024 * 1024,
  });
  const normalized = stdout.replace(/\r\n/g, '\n').trimEnd();
  const splitIndex = normalized.lastIndexOf('\n');
  if (splitIndex === -1) {
    throw new Error('Curl fallback returned an unexpected response');
  }

  const responseBody = normalized.slice(0, splitIndex);
  const statusCode = parseInt(normalized.slice(splitIndex + 1), 10);
  if (!Number.isFinite(statusCode)) {
    throw new Error('Curl fallback returned an invalid status code');
  }

  return {
    statusCode,
    body: responseBody,
  };
}

function buildGeminiTargetUrls(requestUrl: string) {
  const baseUrls = [APP_CONFIG.geminiBaseUrl, ...APP_CONFIG.geminiFallbackBaseUrls].filter(Boolean) as string[];
  return baseUrls.map((baseUrl) => new URL(requestUrl, baseUrl));
}

function extractGeminiModelFromUrl(requestUrl: string) {
  const match = requestUrl.match(/models\/([^/:?]+)/i);
  return match?.[1] || null;
}

function applySecurityHeaders(req: express.Request, res: express.Response) {
  res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=()');

  if (APP_CONFIG.isProduction && isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https:",
    "font-src 'self' data: https://fonts.gstatic.com https://fonts.gstatic.cn https://fonts.googleapis.com https://fonts.googleapis.cn",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.googleapis.cn",
  ].join('; ');
}

function isSecureRequest(req: express.Request) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

const currentFilePath = fileURLToPath(import.meta.url);
const isStartedByPm2 = typeof process.env.pm_id !== 'undefined';
const isMainModule = isStartedByPm2 || (process.argv[1] ? path.resolve(process.argv[1]) === currentFilePath : false);

if (isMainModule) {
  registerProcessErrorHooks();
  startServer();
}
