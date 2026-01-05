import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from '../../../../../.svelte-kit/types/src/routes/(new layout)/media/$types';
import type { AuthenticatedPageData } from '../../types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const userListResult = await safe(
    rpcClient
      .admin
      .users
      .list(undefined, { context: { cookies, fetch } }),
  );

  if (isDefinedError(userListResult.error) && userListResult.error.code === 'NO_PERMISSIONS') {
    error(403, 'You do not have permission to view this page');
  } else if (userListResult.error != null) {
    throw userListResult.error;
  }

  return userListResult.data satisfies AuthenticatedPageData;
};
