import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { AuthenticatedPageData } from '../../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies, params }) => {
  const reportResult = await safe(
    rpcClient
      .admin
      .feedback
      .get({ id: params.feedbackId }, { context: { cookies, fetch } }),
  );

  if (isDefinedError(reportResult.error) && reportResult.error.code === 'NO_PERMISSIONS') {
    error(403, 'You do not have permission to view this page');
  } else if (isDefinedError(reportResult.error) && reportResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'The requested feedback report was not found');
  } else if (reportResult.error != null) {
    throw reportResult.error;
  }

  return reportResult.data satisfies AuthenticatedPageData;
};
