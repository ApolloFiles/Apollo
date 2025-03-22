import Path from 'node:path';
import { getConfig, getPrismaClient } from '../Constants';
import LibraryManager from '../media/libraries/LibraryManager';
import ApolloUserStorage from '../user/ApolloUserStorage';
import { SvelteKitRequest } from '../webserver/SvelteKitMiddleware';
import { LoginTemplateData } from './LoginTemplate';

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

export interface MediaWatchPageData extends AuthenticatedPageRequestData {
  readonly pageData: {
    media: {
      title: string;
      episode?: {
        season: number,
        episode: number,
        title: string
      };
      thumbnailImageUrl: string;
      audioTracks: string[];
      subtitleTracks: string[];
    }
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
    }[]
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
      displayName: user.displayName
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
        href: `${Path.join('/login/third-party/', thirdPartyKey)}`
      });
    }

    return {
      loggedInUser: null,
      pageData: { oAuthProvider }
    };
  }

  async getMediaOverviewData(request: SvelteKitRequest): Promise<MediaOverviewPageData> {
    const loggedInUser = await this.getLoggedInUser(request);

    const apolloUser = await new ApolloUserStorage().findById(BigInt(loggedInUser.id));
    if (apolloUser == null) {
      throw new Error('Logged in user does not exist');
    }
    const libraryManager = new LibraryManager(apolloUser);
    const libraries = await libraryManager.getLibraries();

    const everyMediaTitle: {
      id: string,
      displayName: string,
      library: { id: string, displayName: string },
      coverImage: { url: string, width?: number, height?: number }
    }[] = [];
    for (const library of libraries) {
      const mediaTitles = await library.fetchTitles();
      for (const mediaTitle of mediaTitles) {
        everyMediaTitle.push({
          id: mediaTitle.id.toString(),
          displayName: mediaTitle.title,
          library: {
            id: library.id,
            displayName: library.name
          },
          coverImage: {
            url: `/media/library/${library.id}/${mediaTitle.id}/assets/poster.jpg`,
            height: 720
          }
        });
      }
    }

    return {
      loggedInUser: loggedInUser,
      pageData: {
        libraries: libraries.map(library => {
          return {
            id: library.id,
            displayName: library.name
          };
        }),
        sharedLibraries: [],
        continueWatching: [],
        recentlyAdded: [],
        everything: everyMediaTitle
      }
    };
  }

  async getMediaOverviewDataForLibrary(request: SvelteKitRequest, libraryId: string): Promise<MediaOverviewByLibraryPageData> {
    const loggedInUser = await this.getLoggedInUser(request);

    const apolloUser = await new ApolloUserStorage().findById(BigInt(loggedInUser.id));
    if (apolloUser == null) {
      throw new Error('Logged in user does not exist');
    }
    const libraryManager = new LibraryManager(apolloUser);
    const library = await libraryManager.getLibrary(libraryId);
    if (library == null) {
      throw new Error('Library does not exist');  // TODO: show 404 page
    }

    const everyMediaTitle: {
      id: string,
      displayName: string,
      library: { id: string, displayName: string },
      coverImage: { url: string, width?: number, height?: number }
    }[] = [];
    const mediaTitles = await library.fetchTitles();
    for (const mediaTitle of mediaTitles) {
      everyMediaTitle.push({
        id: mediaTitle.id.toString(),
        displayName: mediaTitle.title,
        library: {
          id: library.id,
          displayName: library.name
        },
        coverImage: {
          url: `/media/library/${library.id}/${mediaTitle.id}/assets/poster.jpg`,
          height: 720
        }
      });
    }

    return {
      loggedInUser: loggedInUser,
      pageData: {
        library: {
          id: library.id,
          displayName: library.name
        },
        libraries: (await libraryManager.getLibraries()).map(library => {
          return {
            id: library.id,
            displayName: library.name
          };
        }),
        sharedLibraries: [],
        continueWatching: [],
        recentlyAdded: [],
        everything: everyMediaTitle
      }
    };
  }

  async getMediaTitleData(request: SvelteKitRequest, libraryId: string, mediaId: string): Promise<MediaTitlePageData> {
    const loggedInUser = await this.getLoggedInUser(request);

    const apolloUser = await new ApolloUserStorage().findById(BigInt(loggedInUser.id));
    if (apolloUser == null) {
      throw new Error('Logged in user does not exist');
    }
    const libraryManager = new LibraryManager(apolloUser);
    const library = await libraryManager.getLibrary(libraryId);
    if (library == null) {
      throw new Error('Library does not exist');  // TODO: show 404 page
    }

    const mediaTitle = await library.fetchTitle(mediaId);
    if (mediaTitle == null) {
      throw new Error('MediaTitle does not exist');  // TODO: show 404 page
    }

    const media = await getPrismaClient()!.mediaLibraryMediaItem.findMany({
      where: { mediaId: mediaTitle.id },
      orderBy: [
        { seasonNumber: 'asc' },
        { episodeNumber: 'asc' }
      ]
    });

    const mediaTitleSeasons: MediaTitlePageData['pageData']['mediaTitle']['mediaContent']['seasons'] = [];
    for (const mediaItem of media) {
      let season = mediaTitleSeasons.find(s => s.counter === (mediaItem.seasonNumber ?? 666)); // FIXME: Properly support specials/misc/etc.
      if (season == null) {
        mediaTitleSeasons.push(season = {
          counter: mediaItem.seasonNumber ?? 666, // FIXME: Properly support specials/misc/etc.
          episodes: []
        });
      }

      season.episodes.push({
        id: mediaItem.id.toString(),
        displayName: mediaItem.title,
        synopsis: mediaItem.synopsis ?? undefined,
        durationInSec: mediaItem.durationInSec,
        thumbnailImageUrl: `/media/library/${library.id}/${mediaTitle.id}/${Buffer.from(mediaItem.filePath).toString('base64')}/assets/thumbnail.png`
      });
    }

    return {
      loggedInUser: loggedInUser,
      pageData: {
        mediaTitle: {
          library: {
            id: library.id,
            displayName: library.name
          },

          id: mediaTitle.id.toString(),
          displayName: mediaTitle.title,
          synopsis: mediaTitle.synopsis ?? undefined,
          thumbnailImageUrl: `/media/library/${library.id}/${mediaTitle.id}/assets/poster.jpg`,
          mediaContent: {
            type: 'series',
            seasons: mediaTitleSeasons
          }
        },
        libraries: (await libraryManager.getLibraries()).map(library => {
          return {
            id: library.id,
            displayName: library.name
          };
        }),
        sharedLibraries: []
      }
    };
  }
}
