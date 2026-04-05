import path from 'node:path';
import 'dotenv/config';

const root = process.env.APP_ROOT ? path.resolve(process.env.APP_ROOT) : process.cwd();
process.env.APP_ROOT = root;

const { validateAppConfig, APP_CONFIG } = await import('../services/appConfig.ts');

validateAppConfig();
console.log('\u73af\u5883\u53d8\u91cf\u914d\u7f6e\u6821\u9a8c\u901a\u8fc7\u3002');
console.log(JSON.stringify({
  appBaseUrl: APP_CONFIG.appBaseUrl,
  backupDir: APP_CONFIG.backupDir,
  dailyGeminiCalls: APP_CONFIG.dailyGeminiCalls,
  dailyMemoryQueries: APP_CONFIG.dailyMemoryQueries,
  disableLiveAi: APP_CONFIG.disableLiveAi,
}, null, 2));
