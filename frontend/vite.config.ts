import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5177,
    strictPort: true,
    proxy: {
      '/api/': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      cookieName: 'uiLanguage',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
  ],
});
