import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { AuthenticatedPageData } from '../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const reportListResult = await safe(
    rpcClient
      .admin
      .feedback
      .list(undefined, { context: { cookies, fetch } }),
  );

  if (isDefinedError(reportListResult.error) && reportListResult.error.code === 'NO_PERMISSIONS') {
    error(403, 'You do not have permission to view this page');
  } else if (reportListResult.error != null) {
    throw reportListResult.error;
  }

  return reportListResult.data satisfies AuthenticatedPageData;
};
