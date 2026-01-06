import { buildMediaSideBarMenuItems } from '$lib/components/media/MediaSideBarMenuItemsBuilder';
import { rpcClient } from '$lib/oRPC';
import type { RenderingLayoutData } from '../../../types';
import type { PageServerLoad } from './$types';

// TODO: load function should be ready; Next: implement/update the page/rendering
// TODO: nope, sharedWithUsers is missing and I want an endpoint for 'user suggestions/completions'
//       the completion endpoint should show other users I have shared libraries with before and on exact ID matches

export const load: PageServerLoad = async ({ fetch, cookies, params }) => {
  const createMode = params.libraryId === 'create';

  // TODO: proper type-hint
  let pageData;

  if (!createMode) {
    pageData = await rpcClient
      .media
      .management
      .get({ libraryId: params.libraryId }, { context: { cookies, fetch } });
  } else {
    const libraryList = await rpcClient
      .media
      .management
      .list({}, { context: { cookies, fetch } });

    pageData = {
      ...libraryList,
      library: {
        id: '',
        name: '',
        directoryUris: [],
        sharedWith: [],
      },
    };
  }

  return {
    ...pageData,
    createMode,
    rendering: {
      layout: {
        sideBarMenuItems: buildMediaSideBarMenuItems(pageData.libraries),
      },
    },
  } satisfies { [key: string]: unknown } & RenderingLayoutData;
};
