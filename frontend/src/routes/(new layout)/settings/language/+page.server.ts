import { rpcClient } from '$lib/oRPC';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  return {
    loggedInUser: await rpcClient.user.get(undefined, { context: { cookies, fetch } }),
  };
};
