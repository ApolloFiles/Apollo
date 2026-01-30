import { createORPCClient, onError, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { oRpcContract } from '../../../backend/src/utils/orpc/contract/oRpcContract';

let rpcClient: ContractRouterClient<typeof oRpcContract>;

export function getClientSideRpcClient(customFetch?: typeof fetch): ContractRouterClient<typeof oRpcContract> {
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
