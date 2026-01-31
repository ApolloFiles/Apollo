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

  if (pageData.page.result.order !== 'recentlyAdded') {
    throw new Error('library overview with no library filter expected to be ordered as recentlyAdded, got ' + libraryOverviewResult.data.page.result.order);
  }

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
