import Path from 'node:path';
import { container } from 'tsyringe';
import { getConfig, getPrismaClient } from '../Constants';
import MediaLibrary from '../media/library-new/MediaLibrary/MediaLibrary';
import MediaLibraryFinder from '../media/library-new/MediaLibrary/MediaLibraryFinder';
import MediaLibraryMediaFinder from '../media/library-new/MediaLibraryMedia/MediaLibraryMediaFinder';
import MediaLibraryMediaItemFinder from '../media/library-new/MediaLibraryMediaItem/MediaLibraryMediaItemFinder';
import ApolloUserStorage from '../user/ApolloUserStorage';
import type { SvelteKitRequest } from '../webserver/SvelteKitMiddleware';
import type { LoginTemplateData } from './LoginTemplate';

// TODO: Split into multiple files?
// TODO: Use generics for pageData-type instead of extending everytime
type LoggedInUserData = {
  readonly id: string;
  readonly displayName: string;
};

export interface PageRequestData {
  readonly loggedInUser: LoggedInUserData | null;
  readonly pageData: Record<string, any>;
}

export interface AuthenticatedPageRequestData extends PageRequestData {
  readonly loggedInUser: LoggedInUserData;
}

export interface LoginPageData extends PageRequestData {
  readonly loggedInUser: null;
  readonly pageData: {
    oAuthProvider: { id: string, displayName: string, href: string }[];
  };
}

export interface MediaOverviewPageData extends AuthenticatedPageRequestData {
  readonly pageData: {
    libraries: { id: string, displayName: string }[];
    sharedLibraries: { id: string, displayName: string }[];
    continueWatching: {
      id: string,
      displayName: string,
      subheading: string,
      thumbnailImageUrl: string,
      watchProgress: number
    }[];
    recentlyAdded: {
      id: string,
      displayName: string,
      subheading: string,
      thumbnailImageUrl: string,
      watchProgress: number
    }[];
    everything: {
      id: string,
      displayName: string,
      library: { id: string, displayName: string },
      coverImage: { url: string, width?: number, height?: number }
    }[]; // FIXME (infinite scrolling etc.)
  };
}

export interface MediaOverviewByLibraryPageData extends MediaOverviewPageData {
  readonly pageData: MediaOverviewPageData['pageData'] & {
    library: { id: string, displayName: string };
  };
}

type MediaTitlePageData_MediaContent_Series = {
  type: 'series',
  seasons: {
    counter: number,
    episodes: {
      id: string,
      displayName: string,
      durationInSec: number,
      synopsis?: string,
      thumbnailImageUrl: string,
      watchProgressPercentage: number,
    }[],
  }[]
};

export interface MediaTitlePageData extends AuthenticatedPageRequestData {
  readonly pageData: {
    mediaTitle: {
      id: string,
      displayName: string,
      library: { id: string, displayName: string },
      synopsis?: string,
      thumbnailImageUrl: string,

      mediaContent: MediaTitlePageData_MediaContent_Series,
    };

    libraries: { id: string, displayName: string }[];
    sharedLibraries: { id: string, displayName: string }[];
  };
}

export default class FrontendRenderingDataAccess {
  async getLoggedInUser(request: SvelteKitRequest): Promise<LoggedInUserData> {
    const userId = request.headers.get('x-apollo-logged-in-user-id') || null;
    if (userId == null) {
      throw new Error('User is not logged in (No injected user id found in URL)');
    }

    const user = await new ApolloUserStorage().findById(BigInt(userId));
    if (user == null) {
      throw new Error('User is not logged in (User not found in database)');
    }

    return {
      id: user.id.toString(),
      displayName: user.displayName,
    };
  }

  getLoginData(): LoginPageData {
    const oAuthProvider: LoginTemplateData['oAuthProvider'] = [];

    for (const thirdPartyKey in getConfig().data.login.thirdParty) {
      const thirdParty = getConfig().data.login.thirdParty[thirdPartyKey];
      if (!thirdParty.enabled) {
        continue;
      }

      oAuthProvider.push({
        id: thirdPartyKey,
        displayName: thirdParty.displayName ?? thirdPartyKey,
        //        href: `${Path.join('/login/third-party/', thirdPartyKey)}?returnTo=${encodeURIComponent(extractReturnTo(req))}`
        href: `${Path.join('/login/third-party/', thirdPartyKey)}`,
      });
    }

    return {
      loggedInUser: null,
      pageData: { oAuthProvider },
    };
  }

  async getLibraryMediaOverviewData(request: SvelteKitRequest, libraryIdToFilterBy: string): Promise<MediaOverviewByLibraryPageData>;
  async getLibraryMediaOverviewData(request: SvelteKitRequest, libraryIdToFilterBy: null): Promise<MediaOverviewPageData>;
  async getLibraryMediaOverviewData(request: SvelteKitRequest, libraryIdToFilterBy: string | null): Promise<MediaOverviewPageData | MediaOverviewByLibraryPageData> {
    const loggedInUser = await this.getLoggedInUser(request);

    const apolloUser = await new ApolloUserStorage().findById(BigInt(loggedInUser.id));
    if (apolloUser == null) {
      throw new Error('Logged in user does not exist');
    }

    const libraryFinder = container.resolve(MediaLibraryFinder);

    let library: MediaLibrary | null = null;
    if (libraryIdToFilterBy != null) {
      library = await libraryFinder.find(BigInt(libraryIdToFilterBy));
      if (library == null || !library.canRead(apolloUser)) {
        throw new Error('Library does not exist or you do not have permission to read it');  // TODO: show 404 page
      }
    }

    const [ownedLibraries, sharedLibraries] = await Promise.all([
      libraryFinder.findOwnedBy(apolloUser.id),
      libraryFinder.findSharedWith(apolloUser.id),
    ]);
    const allLibraries = [...ownedLibraries, ...sharedLibraries];

    const everyMediaItem: {
      id: string,
      displayName: string,
      library: { id: string, displayName: string },
      coverImage: { url: string, width?: number, height?: number }
    }[] = [];

    const libraryMediaFinder = container.resolve(MediaLibraryMediaFinder);
    const allLibraryMedia = await (
      libraryIdToFilterBy != null ?
        libraryMediaFinder.findByLibraryId(BigInt(libraryIdToFilterBy)) :
        libraryMediaFinder.findByLibraryIds([...ownedLibraries, ...sharedLibraries].map(l => l.id))
    );

    for (const libraryMedia of allLibraryMedia) {
      everyMediaItem.push({
        id: libraryMedia.id.toString(),
        displayName: libraryMedia.title,
        library: {
          id: libraryMedia.libraryId.toString(),
          displayName: allLibraries.find(l => l.id === libraryMedia.libraryId)!.name,
        },
        coverImage: {
          url: `/media/library/${libraryMedia.libraryId}/${libraryMedia.id}/assets/poster.jpg`,
          height: 720,
        },
      });
    }

    return {
      loggedInUser: loggedInUser,
      pageData: {
        library: library != null ? {
          id: library.id.toString(),
          displayName: library.name,
        } : undefined,
        libraries: ownedLibraries.map(library => {
          return {
            id: library.id.toString(),
            displayName: library.name,
          };
        }),
        sharedLibraries: sharedLibraries.map(library => {
          return {
            id: library.id.toString(),
            displayName: library.name,
          };
        }),
        continueWatching: [],
        recentlyAdded: [],
        everything: everyMediaItem,
      },
    };
  }

  async getLibraryMediaDetailData(request: SvelteKitRequest, libraryId: string, mediaId: string): Promise<MediaTitlePageData> {
    const loggedInUser = await this.getLoggedInUser(request);

    const apolloUser = await new ApolloUserStorage().findById(BigInt(loggedInUser.id));
    if (apolloUser == null) {
      throw new Error('Logged in user does not exist');
    }

    const libraryFinder = container.resolve(MediaLibraryFinder);
    const libraryMediaFinder = container.resolve(MediaLibraryMediaFinder);
    const libraryMediaItemFinder = container.resolve(MediaLibraryMediaItemFinder);

    const library = await libraryFinder.find(BigInt(libraryId));
    if (library == null || !library.canRead(apolloUser)) {
      throw new Error('Library does not exist or you do not have permission to read it');  // TODO: show 404 page
    }

    const libraryMedia = await libraryMediaFinder.find(BigInt(mediaId));
    if (libraryMedia == null || !libraryMedia.canRead(apolloUser)) {
      throw new Error('Media does not exist or you do not have permission to read it');  // TODO: show 404 page
    }

    const mediaItems = await libraryMediaItemFinder.findByMediaId(libraryMedia.id);

    const mediaTitleSeasons: MediaTitlePageData['pageData']['mediaTitle']['mediaContent']['seasons'] = [];
    for (const mediaItem of mediaItems) {
      let season = mediaTitleSeasons.find(s => s.counter === (mediaItem.seasonNumber ?? 666)); // FIXME: Properly support specials/misc/etc.
      if (season == null) {
        mediaTitleSeasons.push(season = {
          counter: mediaItem.seasonNumber ?? 666, // FIXME: Properly support specials/misc/etc.
          episodes: [],
        });
      }

      const watchProgress = await getPrismaClient()!.mediaLibraryUserWatchProgress.findUnique({
        select: { durationInSec: true },
        where: {
          userId_mediaItemId: {
            userId: apolloUser.id,
            mediaItemId: mediaItem.id,
          },
        },
      });
      season.episodes.push({
        id: mediaItem.id.toString(),
        displayName: mediaItem.title,
        synopsis: mediaItem.synopsis ?? undefined,
        durationInSec: mediaItem.durationInSeconds,
        thumbnailImageUrl: `/media/library/${library.id}/${libraryMedia.id}/${Buffer.from(mediaItem.filePath).toString('base64')}/assets/thumbnail.png`,
        watchProgressPercentage: (watchProgress?.durationInSec ?? 0) / mediaItem.durationInSeconds * 100,
      });
    }

    const [ownedLibraries, sharedLibraries] = await Promise.all([
      libraryFinder.findOwnedBy(apolloUser.id),
      libraryFinder.findSharedWith(apolloUser.id),
    ]);

    return {
      loggedInUser: loggedInUser,
      pageData: {
        mediaTitle: {
          library: {
            id: library.id.toString(),
            displayName: library.name,
          },

          id: libraryMedia.id.toString(),
          displayName: libraryMedia.title,
          synopsis: libraryMedia.synopsis ?? undefined,
          thumbnailImageUrl: `/media/library/${library.id}/${libraryMedia.id}/assets/poster.jpg`,
          mediaContent: {
            type: 'series',
            seasons: mediaTitleSeasons,
          },
        },

        libraries: ownedLibraries.map(library => {
          return {
            id: library.id.toString(),
            displayName: library.name,
          };
        }),
        sharedLibraries: sharedLibraries.map(library => {
          return {
            id: library.id.toString(),
            displayName: library.name,
          };
        }),
      },
    };
  }
}
