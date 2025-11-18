import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { MediaOverviewPageData } from '../../legacy-types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }): Promise<MediaOverviewPageData> => {
  const libraryOverviewResult = await safe(rpcClient.media.legacy.fetchLibraryOverviewData(
    { libraryIdToFilterBy: params.libraryId },
    { context: { cookies, fetch } },
  ));

  if (isDefinedError(libraryOverviewResult.error) && libraryOverviewResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'Library does not exist or you do not have access to it');
  } else if (libraryOverviewResult.error) {
    throw libraryOverviewResult.error;
  }

  return libraryOverviewResult.data;
};
