import { rpcClient } from '$lib/oRPC';
import { safe } from '@orpc/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, fetch }) => {
  const backendConfig = await safe(rpcClient.tmpBackend.getConfig(undefined, { context: { cookies, fetch } }));
  if (backendConfig.error) {
    throw backendConfig.error;
  }

  return {
    config: backendConfig.data,
  };
};
