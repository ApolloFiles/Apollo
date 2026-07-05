import { env } from '$env/dynamic/private';
import { ORpcContract } from '$lib/ORpcHelper';
import { setUiLanguageCookie, UI_LANGUAGE_COOKIE_NAME, uiLanguageCookieValue } from '$lib/uiLanguageCookie';
import { createORPCClient, onError, onSuccess, ORPCError } from '@orpc/client';
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
    onSuccess((output, { path, context }) => {
      const uiLanguage = extractUiLanguageFromORpcResponse(path, output);
      if (uiLanguage === undefined) {
        return;
      }

      if (context.cookies.get(UI_LANGUAGE_COOKIE_NAME) !== uiLanguageCookieValue(uiLanguage)) {
        setUiLanguageCookie(context.cookies, uiLanguage);
      }
    }),
    onError((err) => {
      if (err instanceof ORPCError && err.code === 'UNAUTHORIZED') {
        redirect(303, '/login');
      }

      throw err;
    }),
  ],
}));

function extractUiLanguageFromORpcResponse(path: readonly string[], output: unknown): string | null | undefined {
  if (typeof output !== 'object' || output == null) {
    return undefined;
  }

  // TODO: Unify procedure output structure to not need to look in different places.
  //       Including loggedInUser property for consistency should be cheap
  const procedure = path.join('.');
  if (procedure === 'user.get') {
    return (output as { uiLanguage: string | null }).uiLanguage;
  }
  if (procedure === 'session.get') {
    return (output as { user: { uiLanguage: string | null } }).user?.uiLanguage;
  }

  const loggedInUser = (output as { loggedInUser?: { uiLanguage?: string | null } }).loggedInUser;
  return loggedInUser != null && 'uiLanguage' in loggedInUser ? loggedInUser.uiLanguage : undefined;
}
