import { env } from '$env/dynamic/private';
import { createORPCClient, onError, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { type Cookies, redirect } from '@sveltejs/kit';
import { oRpcContract } from '../../../backend/src/utils/orpc/contract/oRpcContract';

type ClientContext = { cookies: Cookies, fetch: typeof fetch };

export const rpcClient: ContractRouterClient<typeof oRpcContract, ClientContext> = createORPCClient(new RPCLink<ClientContext>({
  // TODO: Normalize APOLLO_BASE_URL trailing slash; Maybe even use another env-var that is set @runtime for prod by the backend process
  url: (env.APOLLO_BASE_URL ? env.APOLLO_BASE_URL : 'http://localhost:8081') + '/api/_frontend/oRPC/',
  headers: ({ context }) => {
    let cookieHeaderValue = '';
    for (const cookie of context.cookies.getAll()) {
      cookieHeaderValue += `${encodeURIComponent(cookie.name)}=${encodeURIComponent(cookie.value)}; `;
    }

    return { cookie: cookieHeaderValue };
  },
  fetch: (request, init, { context }) => {
    return context.fetch(request, init);
  },
  interceptors: [
    onError((err) => {
      if (err instanceof ORPCError && err.code === 'UNAUTHORIZED') {
        redirect(303, '/login');
      }

      throw err;
    }),
  ],
}));
