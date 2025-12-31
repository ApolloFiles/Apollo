import { rpcClient } from '$lib/oRPC';
import { redirect } from '@sveltejs/kit';

// FIXME: When a user logs in using a social provider and no account is found, I want the user to see a 'complete registration' screen and better-auth should not create the account automatically
//        (or at least not block the account from being linked to another one, until the registration is complete)
//        I essentially want user-input/-confirmation before creating a new account (maybe the user always uses Google but chose GitHub this time, not knowing/remembering that)

export const load = async ({ cookies, fetch }) => {
  const sessionUser = await rpcClient.session.get(undefined, { context: { cookies, fetch } });
  if (sessionUser != null) {
    redirect(303, '/');
  }

  const backendConfig = await rpcClient.tmpBackend.getConfig(undefined, { context: { cookies, fetch } });
  return {
    appBaseUrl: backendConfig.appBaseUrl,
    availableLoginProviders: backendConfig.auth.providers,
  };
};
