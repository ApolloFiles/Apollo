import { rpcClient } from '$lib/oRPC';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const [loggedInUser, accessTokenList] = await Promise.all([
    rpcClient.user.get(undefined, { context: { cookies, fetch } }),
    rpcClient.user.settings.accessTokens.list(undefined, { context: { cookies, fetch } }),
  ]);

  return {
    loggedInUser,
    tokens: accessTokenList.tokens,
  };
};
