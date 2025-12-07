import { rpcClient } from '$lib/oRPC';
import { safe, isDefinedError } from '@orpc/client';
import { error } from '@sveltejs/kit';
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

  return {
    ...mediaResult.data,
    rendering: {
      topBarOverlay: true,
      mainContentType: 'detail-page',
    },
  };
};
