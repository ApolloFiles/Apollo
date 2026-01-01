import { dev } from '$app/environment';
import { paraglideMiddleware } from '$lib/paraglide/server';
import type { Handle, HandleFetch } from '@sveltejs/kit';

export const handleFetch: HandleFetch = async ({ request, fetch }) => {
  if (dev) {
    console.log(`[fetch] >> ${request.method} ${request.url}`);
  }

  const response = await fetch(request);
  if (dev) {
    console.log(`[fetch] << Status ${response.status} with {content-length=${response.headers.get('content-length')}, content-type=${response.headers.get('content-type')}}`);
  }
  return response;
};

const handleParaglide: Handle = ({ event, resolve }) => paraglideMiddleware(event.request, ({ request, locale }) => {
  event.request = request;

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale),
  });
});
export const handle: Handle = async (input) => {
  input.event.setHeaders({
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });

  return handleParaglide(input);
};
