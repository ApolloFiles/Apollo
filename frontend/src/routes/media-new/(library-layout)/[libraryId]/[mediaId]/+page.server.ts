import { dev } from '$app/environment';
import type { MediaTitlePageData } from '../../../../../../../src/frontend/FrontendRenderingDataAccess';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, request }): Promise<MediaTitlePageData> => {
  if (!dev) {
    return locals.apollo.frontendRenderingDataAccess.getLibraryMediaDetailData(request, params.libraryId, params.mediaId);
  }

  const videoThumbnailImageUrl = await import('/_dev/video-thumbnail.png');
  const coverImageUrl = await import('/_dev/series-cover.png');
  return {
    loggedInUser: {
      id: '22',
      displayName: 'Dev-User',
    },
    pageData: {
      mediaTitle: {
        id: params.mediaId,
        displayName: 'Ergo Proxy',  // FIXME: Make sure all the pages use the same example series/shows
        library: {
          id: '1',
          displayName: 'Anime',
        },
        synopsis: 'Within the domed city of Romdo lies one of the last human civilizations on Earth. Thousands of years ago, a global ecological catastrophe doomed the planet; now, life outside these domes is virtually impossible. To expedite mankind\'s recovery, "AutoReivs," humanoid-like robots, have been created to assist people in their day-to-day lives. However, AutoReivs have begun contracting an enigmatic disease called the "Cogito Virus," which grants them self-awareness. Re-l Mayer, the granddaughter of Romdo\'s ruler, is assigned to investigate this phenomenon alongside her AutoReiv partner, Iggy. But what begins as a routine investigation quickly spirals into a conspiracy as Re-l is confronted by humanity\'s darkest sins.\n\nElsewhere in Romdo, an AutoReiv specialist by the name of Vincent Law must also face his demons when surreal events begin occurring around him. Re-l, Iggy, Vincent, and the child AutoReiv named Pino will form an unlikely faction as they struggle to uncover Romdo\'s mysteries and discover the true purpose of the mythical beings called "Proxies."\n\n[Written by MAL Rewrite]',
        thumbnailImageUrl: coverImageUrl.default,

        mediaContent: {
          type: 'series',
          seasons: [
            {
              counter: 1,
              episodes: Array.from({ length: 12 }, (_, i) => ({
                id: (50 + i).toString(),
                displayName: 'The journey begins',
                durationInSec: (22 * 60) + 14,
                synopsis: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
                thumbnailImageUrl: videoThumbnailImageUrl.default,
              })),
            },
            {
              counter: 2,
              episodes: Array.from({ length: 6 }, (_, i) => ({
                id: (100 + i).toString(),
                displayName: 'The journey continues',
                durationInSec: 36,
                synopsis: undefined,
                thumbnailImageUrl: videoThumbnailImageUrl.default,
              })),
            },
          ],
        },
      },

      // FIXME: create some kind of dev-stubs-file with constants for all the pages needing these
      libraries: [
        {
          id: '1',
          displayName: 'Anime',
        },
      ],
      sharedLibraries: [
        {
          id: '5',
          displayName: `Max's collection`,
        },
      ],
    },
  };
};
