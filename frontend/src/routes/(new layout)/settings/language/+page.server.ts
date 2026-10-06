import { rpcClient } from '#lib/oRPC.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  return {
    loggedInUser: await rpcClient.user.get(undefined, { context: { cookies, fetch } }),
  };
};
