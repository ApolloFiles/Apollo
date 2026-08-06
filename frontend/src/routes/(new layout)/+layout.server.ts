import { rpcClient } from '$lib/oRPC';
import { safe } from '@orpc/client';
import type { GlobalLayoutData } from './types';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  const backendConfig = await safe(rpcClient.tmpBackend.getConfig(undefined, { context: { cookies, fetch } }));
  if (backendConfig.error) {
    throw backendConfig.error;
  }

  return {
    feedback: {
      enabled: backendConfig.data.feedback.enabled,
    },
  } satisfies GlobalLayoutData;
};
