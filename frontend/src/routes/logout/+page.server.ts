import { rpcClient } from '$lib/oRPC';
import { redirect } from '@sveltejs/kit';

export const load = async ({ cookies, fetch }) => {
  const sessionUser = await rpcClient.session.get(undefined, { context: { cookies, fetch } });
  if (sessionUser == null) {
    redirect(303, '/login');
  }

  const loggedInUser = await rpcClient.user.get(undefined, { context: { cookies, fetch } });
  return {
    loggedInUser,
  };
};
