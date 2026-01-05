import { rpcClient } from '$lib/oRPC';
import type { AuthenticatedPageData } from '../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }): Promise<AuthenticatedPageData> => {
  return {
    loggedInUser: await rpcClient.user.get(undefined, { context: { cookies, fetch } }),
  };
};
