import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { Agent } from 'undici';
import 'dotenv/config';

import { assetAuthMiddleware, authMiddleware } from './middleware/authMiddleware.ts';
import authRouter from './routes/auth.ts';
import hallsRouter from './routes/halls.ts';
import itemsRouter from './routes/items.ts';
import memoryRouter from './routes/memory.ts';
import stickersRouter from './routes/stickers.ts';
import { getManagedUploadInfo, UPLOADS_DIR } from './services/storage.ts';
import './services/database.ts';

const APP_ROOT = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
const DIST_DIR = path.resolve(APP_ROOT, 'dist');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_GEMINI_BASE_URL = 'https://new.12ai.org';
const DEFAULT_GEMINI_FALLBACK_BASE_URLS = ['https://hk.12ai.org', 'https://cdn.12ai.org'];
const GEMINI_BASE_URL = normalizeBaseUrl(process.env.GEMINI_BASE_URL) || DEFAULT_GEMINI_BASE_URL;
const GEMINI_BASE_URLS = dedupeBaseUrls([
  GEMINI_BASE_URL,
  ...parseBaseUrlList(process.env.GEMINI_FALLBACK_BASE_URLS),
  ...DEFAULT_GEMINI_FALLBACK_BASE_URLS,
]);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const geminiDispatcher = new Agent({
  connect: { timeout: 30_000 },
});
const execFileAsync = promisify(execFile);

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY. Please configure it in .env');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '认证请求过于频繁，请稍后再试' },
});

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});

const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI 请求过于频繁，请稍后再试' },
});

app.use(compression());
app.use((req, res, next) => {
  applySecurityHeaders(req, res);
  next();
});

app.get('/api/healthz', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    uploadsDir: UPLOADS_DIR,
  });
});

app.use(
  '/api/gemini',
  aiLimiter,
  express.json({ limit: '20mb' }),
  authMiddleware,
  async (req, res) => {
    let lastError: any = null;
    let lastUpstream = '';

    for (const targetUrl of buildGeminiTargetUrls(req.url || '/')) {
      lastUpstream = `${targetUrl.origin}${targetUrl.pathname}`;

      try {
        targetUrl.searchParams.delete('key');
        targetUrl.searchParams.set('key', GEMINI_API_KEY);

        const upstreamRes = await fetch(targetUrl.href, {
          method: req.method,
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
          signal: AbortSignal.timeout(120_000),
          dispatcher: geminiDispatcher,
        } as any);

        const data = await upstreamRes.text();
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
            res.status(curlResponse.statusCode).type('application/json').send(curlResponse.body);
            return;
          } catch (curlError: any) {
            console.error('Gemini curl fallback error', {
              name: curlError?.name,
              message: curlError?.message,
              code: curlError?.code,
              stderr: curlError?.stderr,
              upstream: `${targetUrl.origin}${targetUrl.pathname}`,
            });
          }
        }

        console.error('Gemini upstream attempt failed', {
          name: error?.name,
          message: error?.message,
          cause: error?.cause,
          upstream: `${targetUrl.origin}${targetUrl.pathname}`,
        });
      }
    }

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
    `x-goog-api-key: ${GEMINI_API_KEY}`,
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
  return GEMINI_BASE_URLS.map((baseUrl) => new URL(requestUrl, baseUrl));
}

function parseBaseUrlList(value?: string) {
  return (value || '')
    .split(',')
    .map((item) => normalizeBaseUrl(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeBaseUrl(value?: string) {
  if (!value) {
    return null;
  }

  return value.trim().replace(/\/+$/, '');
}

function dedupeBaseUrls(urls: Array<string | null | undefined>) {
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
}

app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/items', apiLimiter, authMiddleware, itemsRouter);
app.use('/api/stickers', apiLimiter, authMiddleware, stickersRouter);
app.use('/api/halls', apiLimiter, authMiddleware, hallsRouter);
app.use('/api/memory', aiLimiter, authMiddleware, memoryRouter);

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

app.use((req, res) => {
  if (path.extname(req.path)) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }

  res.status(404).type('text/plain').send('Not found');
});

app.listen(PORT, HOST, () => {
  console.log(`🏛️  Re-Museum started at http://${HOST}:${PORT}`);
  console.log(`   Gemini upstreams: ${GEMINI_BASE_URLS.join(', ')}`);
  console.log(`   App root: ${APP_ROOT}`);
  console.log(`   Upload directory: ${UPLOADS_DIR}`);
});

function applySecurityHeaders(req: express.Request, res: express.Response) {
  res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=()');

  if (IS_PRODUCTION && isSecureRequest(req)) {
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
