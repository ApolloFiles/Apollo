import { buildMediaSideBarMenuItems } from '$lib/components/media/MediaSideBarMenuItemsBuilder';
import { rpcClient } from '$lib/oRPC';
import { safe } from '@orpc/client';
import type { RenderingLayoutData } from '../../types';
import type { PageServerLoad } from './$types';

export const trailingSlash = 'always';

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
  const query = (url.searchParams.get('q') ?? '').trim();

  // Without a query we still need the sidebar/libraries, which searchMedia provides only for a
  // non-empty query. Fetch the library list separately and render an empty result set.
  if (query.length === 0) {
    const libraryListResult = await safe(
      rpcClient.media.management.list(undefined, { context: { cookies, fetch } }),
    );
    if (libraryListResult.error) {
      throw libraryListResult.error;
    }

    const emptyPageData = {
      loggedInUser: libraryListResult.data.loggedInUser,
      page: {
        libraries: libraryListResult.data.libraries,
        query: '',
        results: [] as { title: string, libraryId: string, libraryName: string, mediaId: string, year: number | null }[],
      },
    };

    return {
      ...emptyPageData,
      rendering: {
        layout: {
          sideBarMenuItems: buildMediaSideBarMenuItems(libraryListResult.data.libraries),
          searchFormAction: '/media/search',
        },
      },
    } satisfies RenderingLayoutData;
  }

  const searchResult = await safe(
    rpcClient.media.searchMedia({ query }, { context: { cookies, fetch } }),
  );
  if (searchResult.error) {
    throw searchResult.error;
  }

  const pageData = searchResult.data;
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
