import { rpcClient } from '$lib/oRPC';
import { safe } from '@orpc/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const libraryOverviewResult = await safe(
    rpcClient
      .media
      .getMediaLibraryOverview({ libraryId: undefined }, { context: { cookies, fetch } }),
  );

  if (libraryOverviewResult.error) {
    throw libraryOverviewResult.error;
  }

  return libraryOverviewResult.data;
};
