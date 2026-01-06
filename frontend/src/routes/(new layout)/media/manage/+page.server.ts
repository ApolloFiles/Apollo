import { buildMediaSideBarMenuItems } from '$lib/components/media/MediaSideBarMenuItemsBuilder';
import { rpcClient } from '$lib/oRPC';
import type { RenderingLayoutData } from '../../types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const pageData = await rpcClient
    .media
    .management
    .list(undefined, { context: { cookies, fetch } });

  const debugReIndexStatus = await rpcClient
    .media
    .management
    .debug
    .fullReIndexStatus(undefined, { context: { cookies, fetch } });

  return {
    ...pageData,
    debugReIndexStatus,

    rendering: {
      layout: {
        sideBarMenuItems: buildMediaSideBarMenuItems(pageData.libraries),
      },
    },
  } satisfies { [key: string]: unknown } & RenderingLayoutData;
};
