import { defineCustomClientStrategy } from '#lib/paraglide/runtime.js';

defineCustomClientStrategy('custom-userPreference', {
  getLocale: () => document.documentElement.lang || undefined,
  setLocale: () => {},
});
