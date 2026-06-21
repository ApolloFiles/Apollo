import { env } from '$env/dynamic/private';
import { ORpcContract } from '$lib/ORpcHelper';
import { createORPCClient, onError, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import * as oRpcPlugins from '@orpc/client/plugins';
import type { ContractRouterClient } from '@orpc/contract';
import { type Cookies, redirect } from '@sveltejs/kit';

type ClientContext = { cookies: Cookies, fetch: typeof fetch };

const backendBaseUrl = env.APOLLO_INTERNAL_BACKEND_URL || 'http://127.0.0.1:8081';
const oRpcUrl = backendBaseUrl + '/api/_frontend/oRPC/';

export const rpcClient: ContractRouterClient<typeof ORpcContract, ClientContext> = createORPCClient(new RPCLink<ClientContext>({
  url: oRpcUrl,
  plugins: [
    new oRpcPlugins.SimpleCsrfProtectionLinkPlugin(),
  ],
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
