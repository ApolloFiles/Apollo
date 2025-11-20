import { rpcClient } from '$lib/oRPC';

export async function load({ cookies, fetch }) {
  const debugInfo = rpcClient.admin.debug.collectDebugInfo(undefined, { context: { cookies, fetch } });
  return { debugInfo };
}
