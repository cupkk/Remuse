import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: path.resolve(__dirname, 'gift-site'),
  publicDir: path.resolve(__dirname, 'public'),
  server: {
    port: 4174,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-gift'),
    emptyOutDir: true,
  },
  preview: {
    port: 4174,
    host: '0.0.0.0',
  },
});
