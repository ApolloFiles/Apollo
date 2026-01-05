import { buildMediaSideBarMenuItems } from '$lib/components/media/MediaSideBarMenuItemsBuilder';
import { rpcClient } from '$lib/oRPC';
import { safe } from '@orpc/client';
import type { RenderingLayoutData } from '../types';
import type { PageServerLoad } from './$types';

export const trailingSlash = 'always';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const libraryOverviewResult = await safe(
    rpcClient
      .media
      .getMediaLibraryOverview({ libraryId: undefined }, { context: { cookies, fetch } }),
  );

  if (libraryOverviewResult.error) {
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
