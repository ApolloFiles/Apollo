import { buildMediaSideBarMenuItems } from '$lib/components/media/MediaSideBarMenuItemsBuilder';
import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { RenderingLayoutData } from '../../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies, params }) => {
  const mediaResult = await safe(
    rpcClient
      .media
      .getMedia({ libraryId: params.libraryId, mediaId: params.mediaId }, { context: { cookies, fetch } }),
  );

  if (isDefinedError(mediaResult.error) && mediaResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'Library or Media does not exist or you do not have access to it');
  } else if (mediaResult.error) {
    throw mediaResult.error;
  }

  const pageData = mediaResult.data;
  return {
    ...pageData,
    rendering: {
      layout: {
        sideBarMenuItems: buildMediaSideBarMenuItems(pageData.page.libraries),
        searchFormAction: '/media/search',
        topNavAsOverlay: true,
        mainContentType: 'media-detail',
      },
    },
  } satisfies RenderingLayoutData;
};
