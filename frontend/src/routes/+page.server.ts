import { rpcClient } from '$lib/oRPC';
import { redirect } from '@sveltejs/kit';

export async function load({ url, cookies, fetch }) {
  const loggedInUser = await rpcClient.session.get(undefined, { context: { cookies, fetch } });

  if (url.pathname !== '/login' && loggedInUser == null) {
    redirect(302, '/login');
  }

  if (loggedInUser == null) {
    throw new Error('User not logged in, cannot be null here');
  }

  return {
    loggedInUser,
  };
}
