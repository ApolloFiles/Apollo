import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
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
    enhancedImages(),
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      cookieName: 'uiLanguage',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
    Icons({
      compiler: 'svelte',
    }),
  ],
});
