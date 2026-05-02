import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import compression from 'compression';
import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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
import journalsRouter from './routes/journals.ts';
import memoryRouter from './routes/memory.ts';
import sharedMuseumsRouter from './routes/sharedMuseums.ts';
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
const MESSAGE_INVALID_REQUEST_RATE = '\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const MESSAGE_AI_BUSY = '\u5f53\u524d AI \u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const MESSAGE_AI_BUSY_TITLE = 'AI \u670d\u52a1\u7e41\u5fd9';
const MESSAGE_AI_BUSY_SUGGESTION = '\u8bf7\u7b49\u5f85\u7247\u523b\u540e\u91cd\u8bd5\u3002';
const MESSAGE_AI_QUOTA_EXCEEDED = '\u4eca\u65e5 AI \u8c03\u7528\u989d\u5ea6\u5df2\u7528\u5b8c\u3002';
const MESSAGE_AI_QUOTA_TITLE = 'AI \u989d\u5ea6\u4e0d\u8db3';
const MESSAGE_AI_QUOTA_SUGGESTION = '\u8bf7\u660e\u5929\u518d\u8bd5\uff0c\u6216\u8054\u7cfb\u7ba1\u7406\u5458\u8c03\u6574\u989d\u5ea6\u914d\u7f6e\u3002';
const MESSAGE_LIVE_AI_DISABLED = '\u5f53\u524d\u73af\u5883\u5df2\u5173\u95ed\u5b9e\u65f6 AI \u80fd\u529b\u3002';
const MESSAGE_UNKNOWN_UPSTREAM_ERROR = '\u4e0a\u6e38 AI \u670d\u52a1\u5f02\u5e38';
const MESSAGE_UPSTREAM_UNREACHABLE = '\u65e0\u6cd5\u8fde\u63a5 Gemini \u4e0a\u6e38\u670d\u52a1';
const MESSAGE_PROXY_ERROR_PREFIX = '\u4ee3\u7406\u8bf7\u6c42\u5931\u8d25';
const MESSAGE_IMAGE_NOT_FOUND = '\u56fe\u7247\u4e0d\u5b58\u5728\u3002';
const MESSAGE_FORBIDDEN = '\u65e0\u6743\u8bbf\u95ee\u3002';
const MESSAGE_NOT_FOUND = '\u672a\u627e\u5230\u5bf9\u5e94\u8d44\u6e90\u3002';
const MESSAGE_INTERNAL_SERVER_ERROR = '\u670d\u52a1\u5668\u5f00\u5c0f\u5dee\u4e86\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002';
const MESSAGE_CURL_UNEXPECTED = '\u5907\u7528\u4ee3\u7406\u8fd4\u56de\u7684\u54cd\u5e94\u5185\u5bb9\u4e0d\u7b26\u5408\u9884\u671f';
const MESSAGE_CURL_INVALID_STATUS = '\u5907\u7528\u4ee3\u7406\u8fd4\u56de\u7684\u72b6\u6001\u7801\u65e0\u6548';
const MESSAGE_INVALID_JSON = '\u8bf7\u6c42\u4f53\u4e0d\u662f\u5408\u6cd5\u7684 JSON\u3002';
const MESSAGE_REQUEST_BODY_TOO_LARGE = '\u8bf7\u6c42\u4f53\u8fc7\u5927\uff0c\u8bf7\u538b\u7f29\u540e\u91cd\u8bd5\u3002';
const MESSAGE_REQUEST_BODY_UNSUPPORTED = '\u5f53\u524d\u8bf7\u6c42\u4f53\u7f16\u7801\u6216\u683c\u5f0f\u4e0d\u53d7\u652f\u6301\u3002';

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
    message: { error: MESSAGE_INVALID_REQUEST_RATE },
  });

  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip || ''),
    skip: (req) => {
      const requestPath = (req.originalUrl || '').split('?')[0];
      return req.method === 'GET' && /^\/api\/ai\/generate-emoji-pack\/tasks\/[^/]+$/.test(requestPath);
    },
    message: {
      error: MESSAGE_AI_BUSY,
      title: MESSAGE_AI_BUSY_TITLE,
      category: 'RATE_LIMIT',
      suggestion: MESSAGE_AI_BUSY_SUGGESTION,
    },
  });

  app.use(compression());
  app.use((req, res, next) => {
    applySecurityHeaders(req, res);
    next();
  });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/auth')) {
      res.setHeader('Cache-Control', 'no-store');
    }
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
  app.use(createJsonBodyParser({ limit: '10mb', skipGeminiProxy: true }));

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
    authMiddleware,
    aiLimiter,
    createJsonBodyParser({ limit: '20mb' }),
    async (req, res) => {
      const startedAt = Date.now();

      const quota = assertWithinUsageQuota(req.userId!, 'gemini-image');
      if (!quota.allowed) {
        res.status(429).json({
          error: MESSAGE_AI_QUOTA_EXCEEDED,
          title: MESSAGE_AI_QUOTA_TITLE,
          category: 'QUOTA_EXCEEDED',
          suggestion: MESSAGE_AI_QUOTA_SUGGESTION,
          usage: quota,
        });
        return;
      }

      if (APP_CONFIG.disableLiveAi) {
        recordAiUsageEvent({
          userId: req.userId!,
          scope: 'gemini-image',
          model: extractGeminiModelFromUrl(req.url || ''),
          success: false,
          durationMs: Date.now() - startedAt,
          details: { disabled: true },
        });
        res.status(503).json({
          error: {
            code: 503,
            message: MESSAGE_LIVE_AI_DISABLED,
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
            scope: 'gemini-image',
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
                scope: 'gemini-image',
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
        scope: 'gemini-image',
        model,
        success: false,
        durationMs: Date.now() - startedAt,
        details: {
          upstream: lastUpstream,
          error: lastError?.message || MESSAGE_UNKNOWN_UPSTREAM_ERROR,
        },
      });

      const isTimeout = lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError';
      res.status(isTimeout ? 504 : 502).json({
        error: {
          code: isTimeout ? 504 : 502,
          message: `${MESSAGE_PROXY_ERROR_PREFIX}: ${lastError?.message || MESSAGE_UPSTREAM_UNREACHABLE}`,
          upstream: lastUpstream,
        },
      });
    },
  );

  app.use('/api/auth', authRouter);
  app.use('/api/client-errors', apiLimiter, clientErrorsRouter);
  app.use('/api/ai', authMiddleware, aiLimiter, aiRouter);
  app.use('/api/items', apiLimiter, authMiddleware, itemsRouter);
  app.use('/api/stickers', apiLimiter, authMiddleware, stickersRouter);
  app.use('/api/journals', apiLimiter, authMiddleware, journalsRouter);
  app.use('/api/shared-museums', apiLimiter, authMiddleware, sharedMuseumsRouter);
  app.use('/api/transformation-guides', apiLimiter, authMiddleware, transformationGuidesRouter);
  app.use('/api/halls', apiLimiter, authMiddleware, hallsRouter);
  app.use('/api/memory', authMiddleware, aiLimiter, memoryRouter);
  app.use('/api/feedback', apiLimiter, authMiddleware, feedbackRouter);
  app.use('/api/admin', apiLimiter, authMiddleware, adminMiddleware, adminRouter);

  if (process.env.NODE_ENV === 'test') {
    app.use('/api/test', testRouter);
  }

  app.get(/^\/api\/uploads\/(.+)/, assetAuthMiddleware, (req, res) => {
    const internalUploadPath = req.path.replace(/^\/api/, '');
    const uploadInfo = getManagedUploadInfo(internalUploadPath);

    if (!uploadInfo) {
      res.status(404).json({ error: MESSAGE_IMAGE_NOT_FOUND });
      return;
    }

    if (uploadInfo.userId !== req.userId) {
      res.status(403).json({ error: MESSAGE_FORBIDDEN });
      return;
    }

    if (!fs.existsSync(uploadInfo.absolutePath)) {
      res.status(404).json({ error: MESSAGE_IMAGE_NOT_FOUND });
      return;
    }

    res.setHeader('Cache-Control', 'private, max-age=300, must-revalidate');
    res.sendFile(uploadInfo.fileName, {
      root: path.dirname(uploadInfo.absolutePath),
      dotfiles: 'deny',
    });
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
    res.status(404).json({ error: MESSAGE_NOT_FOUND });
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

    res.status(500).json({ error: MESSAGE_INTERNAL_SERVER_ERROR });
  });

  app.use((req, res) => {
    if (path.extname(req.path)) {
      res.status(404).type('text/plain').send(MESSAGE_NOT_FOUND);
      return;
    }

    res.status(404).type('text/plain').send(MESSAGE_NOT_FOUND);
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
    throw new Error(MESSAGE_CURL_UNEXPECTED);
  }

  const responseBody = normalized.slice(0, splitIndex);
  const statusCode = parseInt(normalized.slice(splitIndex + 1), 10);
  if (!Number.isFinite(statusCode)) {
    throw new Error(MESSAGE_CURL_INVALID_STATUS);
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
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
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
    "font-src 'self' data: https://fonts.gstatic.com https://fonts.gstatic.cn https://fonts.googleapis.com https://fonts.googleapis.cn https://at.alicdn.com https://cdn.yiban.io",
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

function createJsonBodyParser(options: { limit: string; skipGeminiProxy?: boolean }) {
  const parser = express.json({
    limit: options.limit,
    strict: true,
    type: ['application/json', 'application/*+json'],
  });

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (options.skipGeminiProxy && req.path.startsWith('/api/gemini')) {
      next();
      return;
    }

    parser(req, res, (error) => {
      if (!error) {
        next();
        return;
      }

      const parseError = error as Error & { status?: number; type?: string };
      if (parseError.type === 'entity.too.large' || parseError.status === 413) {
        res.status(413).json({ error: MESSAGE_REQUEST_BODY_TOO_LARGE });
        return;
      }

      if (parseError.type === 'entity.parse.failed' || parseError instanceof SyntaxError) {
        res.status(400).json({ error: MESSAGE_INVALID_JSON });
        return;
      }

      if (parseError.type === 'encoding.unsupported') {
        res.status(415).json({ error: MESSAGE_REQUEST_BODY_UNSUPPORTED });
        return;
      }

      next(error);
    });
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMainModule = entryPath === currentFilePath;
const shouldAutoStart =
  process.env.REMUSE_NO_AUTO_START !== '1'
  && process.env.NODE_ENV !== 'test'
  && (isMainModule || process.env.NODE_ENV === 'production');

if (shouldAutoStart) {
  registerProcessErrorHooks();
  startServer();
}
