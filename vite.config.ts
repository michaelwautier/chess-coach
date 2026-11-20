import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// `--mode artifact` builds with relative asset paths so the app can be hosted
// as a claude.ai artifact (or any sub-path) without changes.
export default defineConfig(({ mode }) => ({
  base: mode === 'artifact' ? './' : '/',
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
}));
