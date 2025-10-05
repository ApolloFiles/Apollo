import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
  baseURL: 'http://localhost:8081', // FIXME: Do not hard-code the URL
  basePath: '/api/_auth',
});

export async function performLogout(): Promise<void> {
  await authClient.signOut();
  window.location.href = '/login';
}
