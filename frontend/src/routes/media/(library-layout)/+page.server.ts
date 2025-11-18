import { rpcClient } from '$lib/oRPC';
import { safe } from '@orpc/client';
import type { MediaOverviewPageData } from '../legacy-types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }): Promise<MediaOverviewPageData> => {
  const libraryOverviewResult = await safe(rpcClient.media.legacy.fetchLibraryOverviewData(
    { libraryIdToFilterBy: undefined },
    { context: { cookies, fetch } },
  ));
  if (libraryOverviewResult.error) {
    throw libraryOverviewResult.error;
  }

  return libraryOverviewResult.data;
};
