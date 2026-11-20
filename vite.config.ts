import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

// `--mode artifact` builds with relative asset paths so the app can be hosted
// as a claude.ai artifact (or any sub-path) without changes.
// BASE_PATH sets the public path of a regular build, e.g. `/chess-coach/` on GitHub Pages.
export default defineConfig(({ mode }) => ({
  base: mode === 'artifact' ? './' : (process.env.BASE_PATH ?? '/'),
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
