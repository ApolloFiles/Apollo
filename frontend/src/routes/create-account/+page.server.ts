import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';

export const load = async ({ cookies, fetch, request, url, params }) => {
  const inviteTokenValue = url.searchParams.get('invite') ?? '';

  const inviteTokenResult = await safe(rpcClient.auth.accountCreationInvitation.get(
    { token: inviteTokenValue },
    { context: { cookies, fetch } },
  ));

  if (isDefinedError(inviteTokenResult.error) && inviteTokenResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'Invite token is invalid or expired');
  } else if (isDefinedError(inviteTokenResult.error) && inviteTokenResult.error.code === 'NOT_AVAILABLE_FOR_LOGGED_IN_USER') {
    error(400, 'You are logged in! Please log out, when you want to create another account');
  } else if (inviteTokenResult.error) {
    throw inviteTokenResult.error;
  }

  const backendConfig = await rpcClient.tmpBackend.getConfig(undefined, { context: { cookies, fetch } });
  if (backendConfig.auth.providers.length === 0) {
    error(500, 'The administrator has not finished configuring Apollo (login options missing)');
  }

  return {
    availableLoginProviders: backendConfig.auth.providers,
    inviteToken: inviteTokenValue,
  };
};
