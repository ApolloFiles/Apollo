import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-node';
import { enhancedImages } from '@sveltejs/enhanced-img';
import type { Config } from '@sveltejs/kit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';

type CspDirectives = NonNullable<NonNullable<Config['csp']>['directives']>;
type CspSources = NonNullable<CspDirectives['connect-src']>;

const isDevMode = process.env.NODE_ENV === 'development';

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
    sveltekit({
      // Consult https://svelte.dev/docs/kit/integrations
      // for more information about preprocessors
      preprocess: vitePreprocess(),
      compilerOptions: { runes: true },
      adapter: adapter({ out: './dist/' }),
      csp: {
        directives: {
          'default-src': ['none'],
          'script-src': [
            'self',
            'https://www.youtube.com/',
            'https://player.twitch.tv/',
          ],
          'style-src': ['self', 'unsafe-inline'],
          'font-src': ['self'],
          'img-src': ['self', 'data:', 'blob:'],
          'media-src': ['self', 'blob:'],
          'frame-src': [
            'https://www.youtube.com/embed/',
            'https://player.twitch.tv/',
          ],
          'manifest-src': ['self'],
          'connect-src': [
            'self',
            ...isDevMode ? ['ws://localhost:8081'] satisfies CspSources : [],
          ],
          'worker-src': isDevMode ? ['self', 'blob:'] : undefined,
          'base-uri': ['none'],
          'form-action': ['self'],
          'frame-ancestors': ['none'],
          'object-src': ['none'],
        },
      },
      prerender: { concurrency: 12 },
    }),

    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['custom-userPreference', 'preferredLanguage', 'baseLocale'],
    }),
    Icons({
      compiler: 'svelte',
    }),
  ],
});
