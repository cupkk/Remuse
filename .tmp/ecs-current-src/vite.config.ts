import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const backendPort = env.BACKEND_PORT || env.PORT || '3000';
  const backendTarget = env.VITE_BACKEND_URL || `http://127.0.0.1:${backendPort}`;

  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          timeout: 120_000,
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
    plugins: [react()],
    define: {
      'process.env.GEMINI_PROXY_URL': JSON.stringify(env.GEMINI_PROXY_URL || '/api/gemini'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
