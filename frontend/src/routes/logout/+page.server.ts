import { rpcClient } from '$lib/oRPC';
import { redirect } from '@sveltejs/kit';

// FIXME: Load functions should not have side-effects (like logging out the user) – Find the correct (server-side?) place for this
export const load = async ({ cookies, fetch }) => {
  await rpcClient.session.logoutCurrent(undefined, { context: { cookies, fetch } });
  redirect(302, '/login');
};
