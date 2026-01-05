import { buildMediaSideBarMenuItems } from '$lib/components/media/MediaSideBarMenuItemsBuilder';
import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { RenderingLayoutData } from '../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies, params }) => {
  const libraryOverviewResult = await safe(
    rpcClient
      .media
      .getMediaLibraryOverview({ libraryId: params.libraryId }, { context: { cookies, fetch } }),
  );

  if (isDefinedError(libraryOverviewResult.error) && libraryOverviewResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'Library does not exist or you do not have access to it');
  } else if (libraryOverviewResult.error) {
    throw libraryOverviewResult.error;
  }

  const pageData = libraryOverviewResult.data;
  return {
    ...pageData,
    rendering: {
      layout: {
        sideBarMenuItems: buildMediaSideBarMenuItems(pageData.page.libraries),
        searchFormAction: '/media/search',
      },
    },
  } satisfies RenderingLayoutData;
};
