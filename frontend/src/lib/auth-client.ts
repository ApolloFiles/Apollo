import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
  basePath: '/api/_auth',
});

export async function performLogout(): Promise<void> {
  await authClient.signOut();
  window.location.href = '/login';
}
