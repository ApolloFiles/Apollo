import { defineCustomClientStrategy } from '$lib/paraglide/runtime';

defineCustomClientStrategy('custom-userPreference', {
  getLocale: () => document.documentElement.lang || undefined,
  setLocale: () => {},
});
