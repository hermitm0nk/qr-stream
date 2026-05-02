import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [
    preact({
      resolveModuleFormat: false,
    }),
  ],
  resolve: {
    alias: {
      '@': '/home/aiagent/projects/qr/src',
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
  },
  worker: {
    format: 'es',
  },
  base: '/hermes-web-demos/qr-transfer/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
