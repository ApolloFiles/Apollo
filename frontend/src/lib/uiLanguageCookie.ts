import type { Cookies } from '@sveltejs/kit';

/** Name, sentinel and attributes must mirror the backend's `UiLanguageCookieHelper` */
export const UI_LANGUAGE_COOKIE_NAME = 'apollo_ui_lang';
export const UI_LANGUAGE_AUTO_VALUE = 'auto';
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function uiLanguageCookieValue(uiLanguage: string | null): string {
  return uiLanguage ?? UI_LANGUAGE_AUTO_VALUE;
}

/** Reads the cookie from a raw `Cookie` request header (used by the Paraglide server strategy) */
export function readUiLanguageCookie(cookieHeader: string | null | undefined): string | undefined {
  for (const part of (cookieHeader ?? '').split(';')) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex !== -1 && decodeURIComponent(trimmed.slice(0, separatorIndex)) === UI_LANGUAGE_COOKIE_NAME) {
      return decodeURIComponent(trimmed.slice(separatorIndex + 1));
    }
  }
  return undefined;
}

export function setUiLanguageCookie(cookies: Cookies, uiLanguage: string | null): void {
  cookies.set(UI_LANGUAGE_COOKIE_NAME, uiLanguageCookieValue(uiLanguage), {
    // secure flag is set by SvelteKit
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  });
}

export function setUiLanguageCookieInBrowser(uiLanguage: string | null): void {
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${UI_LANGUAGE_COOKIE_NAME}=${uiLanguageCookieValue(uiLanguage)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax${secure}`;
}
