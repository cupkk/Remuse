import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 1100 },
  },
  webServer: [
    {
      command: 'node --import tsx scripts/start-e2e-server.mjs',
      url: 'http://127.0.0.1:4300/api/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:client -- --host 127.0.0.1 --port 4317',
      url: 'http://127.0.0.1:4317',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_BACKEND_URL: 'http://127.0.0.1:4300',
        BACKEND_PORT: '4300',
      },
    },
  ],
});
