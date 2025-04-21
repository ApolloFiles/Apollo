import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      out: 'build',
    }),
    csp: {
      directives: {
        'default-src': ['none'],
        'script-src': ['self', 'https://www.youtube.com/'],
        'style-src': ['self', 'unsafe-inline'],
        'font-src': ['self'],
        'img-src': ['self', 'data:', 'blob:'],
        'media-src': ['self'],
        'frame-src': ['https://www.youtube.com/embed/'],
        'manifest-src': ['self'],
        'connect-src': ['self'],
        'base-uri': ['none'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};

export default config;
