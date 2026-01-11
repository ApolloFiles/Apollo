import adapter from '@sveltejs/adapter-node';
import type { Config } from '@sveltejs/kit';
import type { Csp } from '@sveltejs/kit/src/types/private';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isDevMode = process.env.NODE_ENV === 'development';

//@ts-ignore
const config: Config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  compilerOptions: {
    runes: true,
  },

  kit: {
    adapter: adapter({ out: './dist/' }),
    csp: {
      directives: {
        'default-src': ['none'],
        'script-src': ['self', 'https://www.youtube.com/'],
        'style-src': ['self', 'unsafe-inline'],
        'font-src': ['self'],
        'img-src': ['self', 'data:', 'blob:'],
        'media-src': ['self', 'blob:'],
        'frame-src': ['https://www.youtube.com/embed/'],
        'manifest-src': ['self'],
        'connect-src': ['self', ...(isDevMode ? ['ws://localhost:8081'] satisfies Csp.Sources : [])],
        'worker-src': isDevMode ? ['self', 'blob:'] : undefined,
        'base-uri': ['none'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
    prerender: {
      concurrency: 12,
    },
  },
};

export default config;
