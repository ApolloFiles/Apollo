import { createORPCClient, onError, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { oRpcRouter } from '../../../backend/src/utils/orpc/oRpcRouter';

let rpcClient: RouterClient<typeof oRpcRouter>;

export function getClientSideRpcClient(customFetch?: typeof fetch): RouterClient<typeof oRpcRouter> {
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
