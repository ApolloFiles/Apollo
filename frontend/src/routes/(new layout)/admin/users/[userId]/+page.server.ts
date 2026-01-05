import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { AuthenticatedPageData } from '../../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies, params }) => {
  const userResult = await safe(
    rpcClient
      .admin
      .users
      .get({ id: params.userId }, { context: { cookies, fetch } }),
  );

  if (isDefinedError(userResult.error) && userResult.error.code === 'NO_PERMISSIONS') {
    error(403, 'You do not have permission to view this page');
  } else if (isDefinedError(userResult.error) && userResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'The requested user was not found');
  } else if (userResult.error != null) {
    throw userResult.error;
  }

  return userResult.data satisfies AuthenticatedPageData;
};
