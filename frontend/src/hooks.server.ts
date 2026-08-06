import { dev } from '$app/environment';
import { defineCustomServerStrategy } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { readUiLanguageCookie, UI_LANGUAGE_AUTO_VALUE } from '$lib/uiLanguageCookie';
import type { Handle, HandleFetch, HandleServerError } from '@sveltejs/kit';

defineCustomServerStrategy('custom-userPreference', {
  getLocale: (request) => {
    const value = readUiLanguageCookie(request?.headers.get('cookie'));
    if (value == null || value === UI_LANGUAGE_AUTO_VALUE) {
      return undefined;
    }
    return value;
  },
});

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const logLine = `[${status}] ${event.request.method} ${event.url.pathname}: ${message}`;

  // Expected client errors (404, etc.) don't carry a useful stack trace – log just the line.
  if (status >= 400 && status < 500) {
    console.warn(logLine);
    return;
  }

  console.error(logLine, error);
};

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
    preload: ({ type, path }) => {
      if (type === 'js' || type === 'css') {
        return true;
      }

      // The @font-face rules sit inside a large stylesheet, so the browser only discovers the font
      // files late and paints everything in the fallback font first. Preloading the upright face
      // avoids that. The italic face is barely used – it may load on demand.
      return type === 'font' && !path.includes('Italic');
    },
  });
});
export const handle: Handle = async (input) => {
  input.event.setHeaders({
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });

  const response = await handleParaglide(input);

  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'private, no-cache');
  }

  return response;
};
