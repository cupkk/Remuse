import path from 'node:path';
import 'dotenv/config';

const root = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
process.env.APP_ROOT = root;

const { validateAppConfig, APP_CONFIG } = await import('../services/appConfig.ts');

validateAppConfig();
console.log('Environment configuration is valid.');
console.log(JSON.stringify({
  appBaseUrl: APP_CONFIG.appBaseUrl,
  backupDir: APP_CONFIG.backupDir,
  adminEmailAllowlistSize: APP_CONFIG.adminEmailAllowlist.size,
  dailyGeminiCalls: APP_CONFIG.dailyGeminiCalls,
  dailyMemoryQueries: APP_CONFIG.dailyMemoryQueries,
  disableLiveAi: APP_CONFIG.disableLiveAi,
}, null, 2));
