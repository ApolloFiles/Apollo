import { rpcClient } from '$lib/oRPC';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { MediaTitlePageData } from '../../../legacy-types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, params }): Promise<MediaTitlePageData> => {
  const mediaDetailResult = await safe(rpcClient.media.legacy.fetchMediaDetailData(
    { libraryId: params.libraryId, mediaId: params.mediaId },
    { context: { cookies, fetch } },
  ));

  if (isDefinedError(mediaDetailResult.error) && mediaDetailResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'Library or media does not exist or you do not have access to it');
  } else if (mediaDetailResult.error) {
    throw mediaDetailResult.error;
  }

  return mediaDetailResult.data;
};
