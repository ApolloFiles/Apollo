import { buildMediaSideBarMenuItems } from '$lib/components/media/MediaSideBarMenuItemsBuilder';
import { rpcClient } from '$lib/oRPC';
import type { ORpcContractOutputs } from '$lib/ORpcHelper';
import type { RenderingLayoutData } from '../../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies, params }) => {
  const createMode = params.libraryId === 'create';

  let pageData: ORpcContractOutputs['media']['management']['get'];

  if (!createMode) {
    pageData = await rpcClient
      .media
      .management
      .get({ libraryId: params.libraryId }, { context: { cookies, fetch } });
  } else {
    const libraryList = await rpcClient
      .media
      .management
      .list(undefined, { context: { cookies, fetch } });

    pageData = {
      ...libraryList,
      library: {
        canManage: true,
        id: '',
        name: '',
        directoryUris: [],
        sharedWith: [],
      },

      // TODO: fetch preference defaults from backend
      libraryUserPreferences: {
        hideFromOverview: false,
        hideFromSidebar: false,
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
