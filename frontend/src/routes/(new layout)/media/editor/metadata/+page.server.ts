import { rpcClient } from '$lib/oRPC';
import type { ORpcContractOutputs } from '$lib/ORpcHelper';
import { isDefinedError, safe } from '@orpc/client';
import { error } from '@sveltejs/kit';
import type { AuthenticatedPageData, RenderingLayoutData } from '../../../types';
import type { PageServerLoad } from './$types';

type PageData = AuthenticatedPageData
                & RenderingLayoutData
                & {
                  files: ORpcContractOutputs['media']['editor']['openPath'],
                  requestedOpenUri: string | null
                };

export const load: PageServerLoad = async ({ fetch, cookies, url }): Promise<PageData> => {
  const fileUri = url.searchParams.get('file');

  const loggedInUser = await rpcClient.user.get(undefined, { context: { cookies, fetch } });

  if (fileUri == null || fileUri.length === 0) {
    return {
      loggedInUser: loggedInUser,
      files: [],
      requestedOpenUri: null,

      rendering: { layout: { sideBarMenuItems: [] } },
    };
  }

  const openPathResult = await safe(rpcClient.media.editor.openPath({ fileUri }, { context: { cookies, fetch } }));

  if (isDefinedError(openPathResult.error) && openPathResult.error.code === 'REQUESTED_ENTITY_NOT_FOUND') {
    error(404, 'The requested path could not be found/opened');
  } else if (openPathResult.error) {
    throw openPathResult.error;
  }

  return {
    loggedInUser: loggedInUser,
    requestedOpenUri: fileUri,
    files: openPathResult.data,

    rendering: { layout: { sideBarMenuItems: [] } },
  };
};
