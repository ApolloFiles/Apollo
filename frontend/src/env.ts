import { defineEnvVars } from '@sveltejs/kit/env';

//noinspection JSUnusedGlobalSymbols
export const variables = defineEnvVars({
  APOLLO_INTERNAL_BACKEND_URL: { schema: (value) => value || 'http://127.0.0.1:8081' },
});
