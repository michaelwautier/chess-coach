import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

/**
 * Content Security Policy of the hosted site. API keys live in the browser, so the point is to refuse any
 * injected script: only the app's own files run. connect-src stays open to HTTPS (and local servers)
 * because the OpenAI base URL can point to any relay; style-src needs 'unsafe-inline' for the piece-set
 * <style> that applyAppearance injects; data: images are chessground's board textures.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

/** Adds the CSP meta tag to production builds (not the dev server, which needs inline scripts and HMR). */
const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
});

// `--mode artifact` builds with relative asset paths so the app can be hosted
// as a claude.ai artifact (or any sub-path) without changes. The artifact runtime sets its own policy.
// BASE_PATH sets the public path of a regular build, e.g. `/chess-coach/` on GitHub Pages.
export default defineConfig(({ mode }) => ({
  base: mode === 'artifact' ? './' : (process.env.BASE_PATH ?? '/'),
  plugins: mode === 'artifact' ? [vue()] : [vue(), contentSecurityPolicy()],
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
