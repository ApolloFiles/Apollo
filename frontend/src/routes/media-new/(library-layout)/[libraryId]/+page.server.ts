import { dev } from '$app/environment';
import type { MediaOverviewByLibraryPageData } from '../../../../../../src/frontend/FrontendRenderingDataAccess';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, request }): Promise<MediaOverviewByLibraryPageData> => {
  if (!dev) {
    return locals.apollo.frontendRenderingDataAccess.getMediaOverviewDataForLibrary(request, params.libraryId);
  }

  const videoThumbnailImageUrl = await import('/_dev/video-thumbnail.png');
  const coverImageUrl = await import('/_dev/series-cover.png');
  return {
    loggedInUser: {
      id: '22',
      displayName: 'Dev-User'
    },
    pageData: {
      library: {
        id: params.libraryId,
        displayName: 'Anime'
      },
      libraries: [
        {
          id: '1',
          displayName: 'Anime'
        }
      ],
      sharedLibraries: [
        {
          id: '5',
          displayName: `Max's collection`
        }
      ],
      continueWatching: Array.from({ length: 3 }, (_, i) => ({
        id: i.toString(),
        displayName: 'Ghost in the Shell',
        subheading: i % 2 === 0 ? 'Movie' : 'S01 · E01 – Name of the Episode',
        thumbnailImageUrl: videoThumbnailImageUrl.default,
        watchProgress: (100 - i * 8) / 100
      })),
      recentlyAdded: Array.from({ length: 6 }, (_, i) => ({
        id: i.toString(),
        displayName: 'Ghost in the Shell',
        subheading: 'S01 · E01 – Name of the Episode',
        thumbnailImageUrl: videoThumbnailImageUrl.default,
        watchProgress: (i % 4 === 0 ? 75 : 0) / 100
      })),
      everything: Array.from({ length: 10 }, (_, i) => ({
        id: i.toString(),
        displayName: 'Professor Layton und die ewige Diva',
        library: {
          id: '1',
          displayName: 'Anime'
        },
        coverImage: {
          url: coverImageUrl.default,
          width: 531,
          height: 720
        }
      }))
    }
  };
};
