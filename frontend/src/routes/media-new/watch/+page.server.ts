import type { MediaWatchPageData } from '../../../../../src/frontend/FrontendRenderingDataAccess';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, request }): Promise<MediaWatchPageData> => { // FIXME: return type

  // TODO:
  // if (!dev) {
  //   return locals.apollo.frontendRenderingDataAccess.getMediaOverviewDataForLibrary(request, params.libraryId);
  // }

  const videoThumbnailImageUrl = await import('/_dev/video-thumbnail.png');
  return {
    loggedInUser: {
      id: '22',
      displayName: 'Dev-User',
    },
    pageData: {
      media: {
        title: 'Ghost in the Shell',
        episode: {
          season: 1,
          episode: 1,
          title: 'The journey begins',
        },
        thumbnailImageUrl: videoThumbnailImageUrl.default,
        audioTracks: [
          'Deutsch (Dolby 5.1)', 'Deutsch (Stereo)',
          'English (Dolby 5.1)', 'English (Stereo)',
        ],
        subtitleTracks: [
          'Deutsch', 'Deutsch (Signs only)',
          'English', 'English (Signs only)',
          'Spanish', 'Spanish (Signs only)',
          'French', 'French (Signs only)',
          'Japanese', 'Japanese (Signs only)',
        ],
      },
    },
  };
};
