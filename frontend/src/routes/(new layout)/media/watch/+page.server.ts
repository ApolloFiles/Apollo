import { rpcClient } from '$lib/oRPC';
import { safe } from '@orpc/client';
import type { PageServerLoad } from '../../../../../.svelte-kit/types/src/routes';

export const load: PageServerLoad = async ({ cookies }) => {
  const backendConfig = await safe(rpcClient.tmpBackend.getConfig({}, { context: { cookies, fetch } }));
  if (backendConfig.error) {
    throw backendConfig.error;
  }

  return {
    config: backendConfig.data,
  };
};
