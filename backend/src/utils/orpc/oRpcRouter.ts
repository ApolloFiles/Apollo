import { onError, ORPCError } from '@orpc/server';
import Fs from 'node:fs';
import { container } from 'tsyringe';
import { z } from 'zod';
import AccountCreationInviteFinder from '../../auth/account_creation_invite/AccountCreationInviteFinder.js';
import OAuthConfigurationProvider from '../../auth/oauth/OAuthConfigurationProvider.js';
import AuthSessionFinder from '../../auth/session/AuthSessionFinder.js';
import AuthSessionRevoker from '../../auth/session/AuthSessionRevoker.js';
import AppConfiguration from '../../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../../constants.js';
import DatabaseClient from '../../database/DatabaseClient.js';
import FileSystemProvider from '../../files/FileSystemProvider.js';
import LibraryManager from '../../plugins/official/media/_old/libraries/LibraryManager.js';
import ProcessBuilder from '../../plugins/official/media/_old/ProcessBuilder.js';
import MediaLibraryMediaFinder from '../../plugins/official/media/library/database/finder/MediaLibraryMediaFinder.js';
import MediaClearLogoImageProvider from '../../plugins/official/media/library/images/MediaClearLogoImageProvider.js';
import UserProvider from '../../user/UserProvider.js';
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
    const oAuthConfigurationProvider = container.resolve(OAuthConfigurationProvider);

    return {
      appBaseUrl: appConfig.config.baseUrl,
      internalBackendBaseUrl: IS_PRODUCTION ? appConfig.config.baseUrl : 'http://localhost:8081',
      auth: {
        providers: oAuthConfigurationProvider.getAvailableTypes(),
      },
    };
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
    const databaseClient = container.resolve(DatabaseClient);
    const oAuthConfigurationProvider = container.resolve(OAuthConfigurationProvider);
    const authSessionFinder = container.resolve(AuthSessionFinder);

    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const additionalUserInfo = await databaseClient.authUser.findUniqueOrThrow({
      where: { id: sessionInfo.user.id },
      select: {
        createdAt: true,
      },
    });
    const linkedProviders = await databaseClient
      .authUserLinkedProvider
      .findMany({
        where: { apolloUserId: sessionInfo.user.id },
        select: {
          provider: true,
          providerUserId: true,
          providerUserDisplayName: true,
          providerProfilePicture: true,
          linkedAt: true,
        },
      });
    const sessions = await authSessionFinder.findByUserId(sessionInfo.user.id);

    return {
      user: {
        id: sessionInfo.user.id,
        name: sessionInfo.user.name,
        createdAt: additionalUserInfo.createdAt,
      },

      linkedAccounts: linkedProviders.map((linkedProvider) => {
        return {
          providerType: linkedProvider.provider,
          providerUserId: linkedProvider.providerUserId,
          providerUserDisplayName: linkedProvider.providerUserDisplayName ?? linkedProvider.providerUserId,
          profilePictureDataUrl: linkedProvider.providerProfilePicture != null ? `data:image/png;base64,${Buffer.from(linkedProvider.providerProfilePicture)
            .toString('base64')}` : null,
          createdAt: linkedProvider.linkedAt,
        };
      }),
      availableAccountProviders: oAuthConfigurationProvider.getAvailableTypes(),

      session: {
        current: sessionInfo.session.id.toString(),
        all: sessions.map((session) => {
          return {
            id: session.id.toString(),
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            userAgent: session.userAgent,
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

    const apolloUser = await userProvider.findById(sessionInfo.user.id);
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

    const apolloUser = await container.resolve(UserProvider).findById(sessionInfo.user.id);
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

    const apolloUser = await container.resolve(UserProvider).findById(sessionInfo.user.id);
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

    const apolloUser = await container.resolve(UserProvider).findById(sessionInfo.user.id);
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

    const mediaHasClearLogoPromise = container.resolve(MediaLibraryMediaFinder)
      .findForUserById(apolloUser, mediaId)
      .then((mediaFromOtherFinder) => {
        if (mediaFromOtherFinder == null) {
          throw new Error('Unexpected null media when checking for clear logo');
        }

        return container.resolve(MediaClearLogoImageProvider).provide(mediaFromOtherFinder!, 'avif');
      })
      .then((imageData) => imageData != null);

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
      hasClearLogo: boolean,
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
          hasClearLogo: await mediaHasClearLogoPromise,
          genres: [],
          nextMediaItemToWatch,
          seasons,
        } satisfies MediaDetail,
      },
    };
  });

const sessionManagement_revokeSingleSession = oRpcBuilder
  .authenticated
  .input(z.object({ sessionId: z.coerce.bigint() }))
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

    await container.resolve(AuthSessionRevoker).revoke(opts.input.sessionId, sessionInfo.user.id);
  });
const sessionManagement_revokeAllSessions = oRpcBuilder
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

    await container.resolve(AuthSessionRevoker).revokeAllForUser(sessionInfo.user.id);
  });
const sessionManagement_revokeAllSessionsExceptCurrent = oRpcBuilder
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

    await container.resolve(AuthSessionRevoker).revokeAllForUserExcept(sessionInfo.user.id, sessionInfo.session.id);
  });

const accountCreationInvitation_get = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ token: z.string() }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo != null) {
      throw opts.errors.NOT_AVAILABLE_FOR_LOGGED_IN_USER();
    }

    const accountCreationInviteFinder = container.resolve(AccountCreationInviteFinder);

    const inviteToken = await accountCreationInviteFinder.findByToken(opts.input.token);
    if (inviteToken == null) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    return {
      createdAt: inviteToken.createdAt,
      expiresAt: inviteToken.expiresAt,
    };
  });

export const oRpcRouter = {
  tmpBackend: {
    getConfig: tmpBackendConfig,
  },

  session: {
    get: getSessionUser,
    getFullProfile: getFullUserProfile,
  },

  auth: {
    sessions: {
      revokeSingleSession: sessionManagement_revokeSingleSession,
      revokeAllSessions: sessionManagement_revokeAllSessions,
      revokeAllSessionsExceptCurrent: sessionManagement_revokeAllSessionsExceptCurrent,
    },

    accountCreationInvitation: {
      get: accountCreationInvitation_get,
    },
  },

  files: {
    browse: {
      listFilesInVirtualFileSystem: listFilesInOwnVirtualFileSystem,
    },
  },

  media: {
    getMediaLibraryOverview: fetchMediaLibraryOverview,
    getMedia: fetchMedia,
  },

  admin: {
    debug: {
      collectDebugInfo: collectAdminDebugInfo,
    },
  },
};
