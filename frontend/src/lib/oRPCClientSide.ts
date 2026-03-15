import { ORpcContract } from '$lib/ORpcHelper';
import { createORPCClient, onError, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';

let rpcClient: ContractRouterClient<typeof ORpcContract>;

export function getClientSideRpcClient(customFetch?: typeof fetch): ContractRouterClient<typeof ORpcContract> {
  if (rpcClient == null) {
    rpcClient = createORPCClient(new RPCLink({
      url: new URL('/api/_frontend/oRPC/', location.href),
      interceptors: [
        onError((err) => {
          if (err instanceof ORPCError && err.code === 'UNAUTHORIZED') {
            window.location.href = '/login';
            return;
          }

          throw err;
        }),
      ],
      fetch: customFetch,
    }));
  }
  return rpcClient;
}
