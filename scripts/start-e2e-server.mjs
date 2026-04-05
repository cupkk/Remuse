import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const runtimeRoot = path.resolve('.tmp', 'e2e-runtime');

await fs.rm(runtimeRoot, { recursive: true, force: true });
await fs.mkdir(path.join(runtimeRoot, 'data'), { recursive: true });
await fs.mkdir(path.join(runtimeRoot, 'uploads'), { recursive: true });
await fs.mkdir(path.join(runtimeRoot, 'backups'), { recursive: true });

process.env.NODE_ENV = 'test';
process.env.APP_ROOT = runtimeRoot;
process.env.DB_PATH = path.join(runtimeRoot, 'data', 'remuse.db');
process.env.UPLOADS_DIR = path.join(runtimeRoot, 'uploads');
process.env.BACKUP_DIR = path.join(runtimeRoot, 'backups');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'playwright-e2e-secret-1234567890';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'playwright-test-key';
process.env.DISABLE_LIVE_AI = 'true';
process.env.AI_MOCK_MODE = 'true';
process.env.EMAIL_DELIVERY_MODE = 'log';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://127.0.0.1:4317';
process.env.PORT = process.env.PORT || '4300';
process.env.HOST = process.env.HOST || '127.0.0.1';

const { startServer } = await import('../server.ts');

const server = startServer();

function shutdown(signal) {
  server.close(() => {
    process.exit(signal === 'SIGINT' ? 130 : 0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
