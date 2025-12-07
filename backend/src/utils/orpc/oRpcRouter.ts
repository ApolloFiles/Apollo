import { onError, ORPCError } from '@orpc/server';
import Fs from 'node:fs';
import { container } from 'tsyringe';
import { z } from 'zod';
import AppConfiguration from '../../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../../constants.js';
import DatabaseClient from '../../database/DatabaseClient.js';
import FileSystemProvider from '../../files/FileSystemProvider.js';
import LibraryManager from '../../plugins/official/media/_old/libraries/LibraryManager.js';
import type MediaLibrary from '../../plugins/official/media/_old/library/MediaLibrary/MediaLibrary.js';
import MediaLibraryFinder from '../../plugins/official/media/_old/library/MediaLibrary/MediaLibraryFinder.js';
import MediaLibraryMediaFinder
  from '../../plugins/official/media/_old/library/MediaLibraryMedia/MediaLibraryMediaFinder.js';
import MediaLibraryMediaItemFinder
  from '../../plugins/official/media/_old/library/MediaLibraryMediaItem/MediaLibraryMediaItemFinder.js';
import ProcessBuilder from '../../plugins/official/media/_old/ProcessBuilder.js';
import UserProvider from '../../user/UserProvider.js';
import { auth } from '../auth.js';
import * as oRpcBuilder from './oRpcRouteBuilder.js';
import type { BackendConfig, FullUserProfile, VirtualFileSystemFileList } from './RouteTypes.js';

const tmpBackendConfig = oRpcBuilder
  .base
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (): Promise<BackendConfig> => {
    const appConfig = container.resolve(AppConfiguration);

    return {
      appBaseUrl: appConfig.config.baseUrl,
      internalBackendBaseUrl: IS_PRODUCTION ? appConfig.config.baseUrl : 'http://localhost:8081',
      auth: {
        providers: Object.keys(auth.options.socialProviders),
      },
    };
  });

const logoutCurrentSession = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts): Promise<{ success: boolean, message?: string }> => {
    if (opts.context.sessionInfo == null) {
      return { success: false, message: 'No active session' };
    }

    await auth.api.signOut({ headers: opts.context.authHeaders });
    return { success: true };
  });

const getSessionUser = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler((opts) => {
    if (opts.context.sessionInfo == null) {
      return null;
    }

    return {
      user: opts.context.sessionInfo.user,
    };
  });

const getFullUserProfile = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts): Promise<FullUserProfile> => {
    const appConfig = container.resolve(AppConfiguration);

    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const accounts = await auth.api.listUserAccounts({ headers: opts.context.authHeaders });
    const sessions = (await auth.api.listSessions({ headers: opts.context.authHeaders }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      user: {
        id: sessionInfo.user.id,
        name: sessionInfo.user.name,
        email: sessionInfo.user.email,
        createdAt: sessionInfo.user.createdAt,
      },

      linkedAccounts: accounts.map((account) => {
        return {
          id: account.id,
          providerId: account.providerId,
          accountId: account.accountId,
          createdAt: account.createdAt,
        };
      }),
      availableAccountProviders: Object.keys(auth.options.socialProviders),
      appBaseUrl: appConfig.config.baseUrl,

      session: {
        current: sessionInfo.session.id,
        all: sessions.map((session) => {
          return {
            id: session.id,
            token: session.token,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            userAgent: session.userAgent ?? null,
            ipAddress: session.ipAddress ?? null,
          };
        }),
      },
    };
  });

const listFilesInOwnVirtualFileSystem = oRpcBuilder
  .authenticated
  .input(z.object({ fileSystemId: z.string(), path: z.string() }))
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts): Promise<VirtualFileSystemFileList> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const userProvider = container.resolve(UserProvider);
    const fileSystemProvider = container.resolve(FileSystemProvider);

    const apolloUser = await userProvider.provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const allFileSystems = await fileSystemProvider.provideForUser(apolloUser);
    const fileSystem = opts.input.fileSystemId === '_' ? allFileSystems.user[0] : [/*allFileSystems.trashBin,*/ ...allFileSystems.user].find((fs) => fs.id === opts.input.fileSystemId);
    if (fileSystem == null) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const requestedFile = fileSystem.getFile(opts.input.path);
    if (!(await requestedFile.exists())) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    if (!(await requestedFile.isDirectory())) {
      // TODO: Proper error handling
      console.debug('Requested path is not a directory');
      throw new Error('Requested path is not a directory');
    }

    const result: VirtualFileSystemFileList = {
      files: [],
    };

    for (const fileListElement of (await requestedFile.getFiles())) {
      result.files.push({
        name: fileListElement.getFileName(),
        isDirectory: await fileListElement.isDirectory(),
        path: fileListElement.path,
      });
    }

    return result;
  });

const fetchLegacyMedia_LibraryOverviewData = oRpcBuilder
  .authenticated
  .input(z.object({ libraryIdToFilterBy: z.string().optional() }))
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const libraryIdToFilterBy = opts.input.libraryIdToFilterBy;

    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const userProvider = container.resolve(UserProvider);
    const libraryFinder = container.resolve(MediaLibraryFinder);
    const libraryMediaFinder = container.resolve(MediaLibraryMediaFinder);

    const apolloUser = await userProvider.provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    let library: MediaLibrary | null = null;
    if (libraryIdToFilterBy != null) {
      library = await libraryFinder.find(BigInt(libraryIdToFilterBy));
      if (library == null || !library.canRead(apolloUser)) {
        throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
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
          url: `/api/_frontend/media/${libraryMedia.libraryId}/${libraryMedia.id}/poster.jpg`,
          height: 720,
        },
      });
    }

    return {
      loggedInUser: {
        id: apolloUser.id,
        displayName: apolloUser.displayName,
      },
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
  });

const fetchLegacyMedia_MediaDetailData = oRpcBuilder
  .authenticated
  .input(z.object({ libraryId: z.string(), mediaId: z.string() }))
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const libraryId = opts.input.libraryId;
    const mediaId = opts.input.mediaId;

    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const userProvider = container.resolve(UserProvider);
    const libraryFinder = container.resolve(MediaLibraryFinder);
    const libraryMediaFinder = container.resolve(MediaLibraryMediaFinder);
    const libraryMediaItemFinder = container.resolve(MediaLibraryMediaItemFinder);
    const databaseClient = container.resolve(DatabaseClient);

    const apolloUser = await userProvider.provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const library = await libraryFinder.find(BigInt(libraryId));
    if (library == null || !library.canRead(apolloUser)) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const libraryMedia = await libraryMediaFinder.find(BigInt(mediaId));
    if (libraryMedia == null || !libraryMedia.canRead(apolloUser)) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const mediaItems = await libraryMediaItemFinder.findByMediaId(libraryMedia.id);

    const mediaTitleSeasons: {
      counter: number,
      episodes: {
        id: string,
        displayName: string,
        durationInSec: number,
        synopsis?: string,
        thumbnailImageUrl: string,
        watchProgressPercentage: number,
      }[],
    }[] = [];
    for (const mediaItem of mediaItems) {
      let season = mediaTitleSeasons.find(s => s.counter === (mediaItem.seasonNumber ?? 666)); // FIXME: Properly support specials/misc/etc.
      if (season == null) {
        mediaTitleSeasons.push(season = {
          counter: mediaItem.seasonNumber ?? 666, // FIXME: Properly support specials/misc/etc.
          episodes: [],
        });
      }

      const watchProgress = await databaseClient.mediaLibraryUserWatchProgress.findUnique({
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
        thumbnailImageUrl: `/api/_frontend/media/${library.id}/${libraryMedia.id}/${Buffer.from(mediaItem.filePath).toString('base64')}/thumbnail.png`,
        watchProgressPercentage: (watchProgress?.durationInSec ?? 0) / mediaItem.durationInSeconds * 100,
      });
    }

    const [ownedLibraries, sharedLibraries] = await Promise.all([
      libraryFinder.findOwnedBy(apolloUser.id),
      libraryFinder.findSharedWith(apolloUser.id),
    ]);

    return {
      loggedInUser: {
        id: apolloUser.id,
        displayName: apolloUser.displayName,
      },
      pageData: {
        mediaTitle: {
          library: {
            id: library.id.toString(),
            displayName: library.name,
          },

          id: libraryMedia.id.toString(),
          displayName: libraryMedia.title,
          synopsis: libraryMedia.synopsis ?? undefined,
          thumbnailImageUrl: `/api/_frontend/media/${library.id}/${libraryMedia.id}/poster.jpg`,
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
  });

const fetchLegacyMedia_Profile = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const apolloUser = await container.resolve(UserProvider).provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    return {
      loggedInUser: {
        id: apolloUser.id,
        displayName: apolloUser.displayName,
      },
    };
  });

const collectAdminDebugInfo = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const apolloUser = await container.resolve(UserProvider).provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const childProcess = await new ProcessBuilder('pgrep', ['--parent', process.pid.toString()])
      .bufferStdOut()
      .runPromised();

    if (childProcess.err) {
      throw childProcess.err;
    }
    if (childProcess.code != 0 && childProcess.code != 1) {
      throw new Error('Could not find child processes using pgrep');
    }

    const fileDescriptors = [];
    const processIds = [
      process.pid,
      ...childProcess.process.bufferedStdOut.toString('utf-8').split('\n'),
    ];

    for (const pid of processIds) {
      try {
        for (const fd of Fs.readdirSync(`/proc/${pid}/fd`)) {
          const linkTarget = Fs.readlinkSync(`/proc/${pid}/fd/${fd}`);

          fileDescriptors.push({ pid: parseInt(pid.toString(), 10), fd: parseInt(fd, 10), linkTarget });
        }
      } catch (err) {
      }
    }

    const openFileDescriptors = fileDescriptors
      .filter(fd => {
        const linkTarget = fd.linkTarget;
        const shouldIgnore = (linkTarget.startsWith('socket:[') && linkTarget.endsWith(']')) ||
          (linkTarget.startsWith('pipe:[') && linkTarget.endsWith(']')) ||
          (linkTarget.startsWith('anon_inode:[') && linkTarget.endsWith(']')) ||
          linkTarget.startsWith('/dev/pts/') ||
          linkTarget == '/dev/null' ||
          linkTarget.startsWith('/dev/nvidia');
        return !shouldIgnore;
      })
      // Sorts by pid, then fd but current process is always first
      .sort((a, b) => {
        if (a.pid == process.pid) {
          return -1;
        }
        if (b.pid == process.pid) {
          return 1;
        }

        return a.pid - b.pid || a.fd - b.fd;
      })
      .map(fileDescriptor => {
        return {
          fd: fileDescriptor.fd,
          linkTarget: fileDescriptor.linkTarget,
          childProcessPid: fileDescriptor.pid !== process.pid ? fileDescriptor.pid : null,
        };
      });

    return {
      ownProcessId: process.pid,
      nvidiaGpuInUse: fileDescriptors.some(fd => fd.linkTarget.startsWith('/dev/nvidia')),
      openFileDescriptors,
    };
  });

const fetchMediaLibraryOverview = oRpcBuilder
  .authenticated
  .input(z.object({ libraryId: z.coerce.bigint().optional() }))
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const libraryIdToFilterBy = opts.input.libraryId;

    const apolloUser = await container.resolve(UserProvider).provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const libraryManager = new LibraryManager(apolloUser);

    type LibraryElement = {
      id: string,
      name: string,
      isOwner: boolean,
    }

    type MediaElement = {
      title: string,
      libraryId: string,
      mediaId: string,
    }

    type ContinueWatchingElement = MediaElement & {
      mediaItemId: string,
      watchProgressPercentage?: number,
      seasonNumber?: number,
      episodeNumber?: number,
    };

    return {
      loggedInUser: {
        id: apolloUser.id,
        displayName: apolloUser.displayName,
      },

      page: {
        libraries: (await libraryManager.getLibraries())
          .map(l => ({
            id: l.id,
            name: l.name,
            isOwner: l.owner.id === apolloUser.id,
          })) satisfies LibraryElement[],
        continueWatching: ((await libraryManager.fetchContinueWatchingItems(libraryIdToFilterBy)).map(i => ({
          title: i.media.title,
          watchProgressPercentage: Math.max(0, Math.min(1, 1 - ((i.item.durationInSec - i.watchProgressInSec) / i.item.durationInSec))),
          libraryId: i.media.libraryId.toString(),
          mediaId: i.media.id.toString(),
          mediaItemId: i.item.id.toString(),
          seasonNumber: i.item.seasonNumber ?? undefined,
          episodeNumber: i.item.episodeNumber ?? undefined,
        }))) satisfies ContinueWatchingElement[],
        recentlyAdded: ((await libraryManager.fetchRecentlyAddedMedia(libraryIdToFilterBy)).map(i => ({
          title: i.title,
          libraryId: i.libraryId.toString(),
          mediaId: i.id.toString(),
        }))) satisfies MediaElement[],
      },
    };
  });

const fetchMedia = oRpcBuilder
  .authenticated
  .input(z.object({ libraryId: z.coerce.bigint(), mediaId: z.coerce.bigint() }))
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const libraryId = opts.input.libraryId;
    const mediaId = opts.input.mediaId;

    const apolloUser = await container.resolve(UserProvider).provideByAuthId(sessionInfo.user.id);
    if (apolloUser == null) {
      // TODO: Proper error handling
      console.debug('Unable to determine ApolloUser for the current session user');
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const libraryManager = new LibraryManager(apolloUser);

    const library = await libraryManager.getLibrary(libraryId.toString());
    if (library == null) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const media = await library.fetchMediaFull(mediaId);
    if (media == null) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const seasonsMap: Map<number, SeasonData> = new Map();
    for (const item of media.items) {
      const seasonNumber = item.seasonNumber ?? 0;
      if (!seasonsMap.has(seasonNumber)) {
        seasonsMap.set(seasonNumber, {
          seasonNumber: seasonNumber,
          episodes: [],
        });
      }

      const watchProgressInSec = await library.fetchMediaWatchProgressInSeconds(item.id);

      seasonsMap.get(seasonNumber)!.episodes.push({
        id: item.id.toString(),
        episodeNumber: item.episodeNumber ?? 0,
        title: item.title,
        synopsis: item.synopsis,
        durationInSeconds: item.durationInSec,
        watchProgress: watchProgressInSec != null ? {
          inSeconds: watchProgressInSec,
          asPercentage: Math.max(0, Math.min(1, 1 - ((item.durationInSec - watchProgressInSec) / item.durationInSec))),
        } : null,
      });
    }

    type LibraryElement = {
      id: string,
      name: string,
      isOwner: boolean,
    }

    type SeasonData = {
      seasonNumber: number,
      episodes: MediaItemData[],
    }

    type MediaItemData = {
      id: string,
      episodeNumber: number,
      title: string,
      synopsis: string | null,
      durationInSeconds: number,
      watchProgress: {
                       inSeconds: number,
                       asPercentage: number,
                     } | null,
    }

    type MediaDetail = {
      id: string,
      type: 'movie' | 'tv_show',
      title: string,
      synopsis: string | null,
      genres: string[],
      nextMediaItemToWatch: MediaItemData | null,
      seasons?: SeasonData[],
    }

    const seasons: MediaDetail['seasons'] = seasonsMap.size > 0 ? Array.from(seasonsMap.values())
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .map(season => ({
        ...season,
        episodes: season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber),
      })) : undefined;

    // TODO: nextMediaItemToWatch should be similar to continue watching logic and fall back to the first episode
    const continueWatchingResultItem = await libraryManager.determineContinueOrNextWatchItemForMedia(mediaId);
    let nextMediaItemToWatch: MediaDetail['nextMediaItemToWatch'] = continueWatchingResultItem != null ? {
      id: continueWatchingResultItem.item.id.toString(),
      title: '',
      synopsis: '',
      episodeNumber: continueWatchingResultItem.item.episodeNumber ?? 0,
      durationInSeconds: continueWatchingResultItem.item.durationInSec,
      watchProgress: {
        inSeconds: continueWatchingResultItem.watchProgressInSec,
        asPercentage: Math.max(0, Math.min(1, 1 - ((continueWatchingResultItem.item.durationInSec - continueWatchingResultItem.watchProgressInSec) / continueWatchingResultItem.item.durationInSec))),
      },
    } : null;

    return {
      loggedInUser: {
        id: apolloUser.id,
        displayName: apolloUser.displayName,
      },

      page: {
        libraries: (await libraryManager.getLibraries())
          .map(l => ({
            id: l.id,
            name: l.name,
            isOwner: l.owner.id === apolloUser.id,
          })) satisfies LibraryElement[],
        media: {
          id: media.id.toString(),
          type: (seasonsMap.size > 1 || !seasonsMap.has(0)) ? 'tv_show' : 'movie',
          title: media.title,
          synopsis: media.synopsis,
          genres: [],
          nextMediaItemToWatch,
          seasons,
        } satisfies MediaDetail,
      },
    };
  });


export const oRpcRouter = {
  tmpBackend: {
    getConfig: tmpBackendConfig,
  },

  session: {
    get: getSessionUser,
    getFullProfile: getFullUserProfile,
    logoutCurrent: logoutCurrentSession,
  },

  files: {
    browse: {
      listFilesInVirtualFileSystem: listFilesInOwnVirtualFileSystem,
    },
  },

  media: {
    legacy: {
      fetchLibraryOverviewData: fetchLegacyMedia_LibraryOverviewData,
      fetchMediaDetailData: fetchLegacyMedia_MediaDetailData,
      fetchProfile: fetchLegacyMedia_Profile,
    },

    getMediaLibraryOverview: fetchMediaLibraryOverview,
    getMedia: fetchMedia,
  },

  admin: {
    debug: {
      collectDebugInfo: collectAdminDebugInfo,
    },
  },
};
