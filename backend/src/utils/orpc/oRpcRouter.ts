import { onError, ORPCError } from '@orpc/server';
import Fs from 'node:fs';
import { container } from 'tsyringe';
import { z } from 'zod';
import AccountCreationInviteCreator from '../../auth/account_creation_invite/AccountCreationInviteCreator.js';
import AccountCreationInviteFinder from '../../auth/account_creation_invite/AccountCreationInviteFinder.js';
import OAuthConfigurationProvider from '../../auth/oauth/OAuthConfigurationProvider.js';
import AuthSessionFinder from '../../auth/session/AuthSessionFinder.js';
import AuthSessionRevoker from '../../auth/session/AuthSessionRevoker.js';
import AppConfiguration from '../../config/AppConfiguration.js';
import { IS_PRODUCTION } from '../../constants.js';
import DatabaseClient from '../../database/DatabaseClient.js';
import FileProvider from '../../files/FileProvider.js';
import FileSystemProvider from '../../files/FileSystemProvider.js';
import LibraryManager from '../../plugins/official/media/_old/libraries/LibraryManager.js';
import ProcessBuilder from '../../plugins/official/media/_old/ProcessBuilder.js';
import MediaLibraryFinder from '../../plugins/official/media/library/database/finder/MediaLibraryFinder.js';
import MediaLibraryMediaFinder from '../../plugins/official/media/library/database/finder/MediaLibraryMediaFinder.js';
import MediaLibraryWriter from '../../plugins/official/media/library/database/writer/MediaLibraryWriter.js';
import FullLibraryIndexingHelper from '../../plugins/official/media/library/FullLibraryIndexingHelper.js';
import MediaClearLogoImageProvider from '../../plugins/official/media/library/images/MediaClearLogoImageProvider.js';
import ApolloFileURI from '../../uri/ApolloFileURI.js';
import UploadedProfilePicturePreProcessor from '../../user/picture/UploadedProfilePicturePreProcessor.js';
import UserProvider from '../../user/UserProvider.js';
import * as oRpcBuilder from './oRpcRouteBuilder.js';
import type { BackendConfig, VirtualFileSystemFileList } from './RouteTypes.js';

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
        providers: oAuthConfigurationProvider.getAvailableTypes().sort((a, b) => {
          return a.displayName.localeCompare(b.displayName);
        }),
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
  .authenticatedAdmin
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo?.user.isSuperUser !== true) {
      throw new Error('Expected a SuperUser session on an authenticatedAdmin route');
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

    const [ownedLibraries, sharedLibraries] = await Promise.all([
      container.resolve(MediaLibraryFinder).findOwnedByUser(apolloUser),
      container.resolve(MediaLibraryFinder).findSharedWithUser(apolloUser),
    ]);

    const libraryManager = new LibraryManager(apolloUser);

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
        isSuperUser: sessionInfo.user.isSuperUser,
      },

      page: {
        libraries: {
          owned: ownedLibraries.map(lib => ({
            id: lib.id.toString(),
            name: lib.name,
            directoryUris: lib.directoryUris,
          })),
          sharedWith: sharedLibraries.map(lib => ({
            id: lib.id.toString(),
            name: lib.name,
          })),
        },
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

    const [ownedLibraries, sharedLibraries] = await Promise.all([
      container.resolve(MediaLibraryFinder).findOwnedByUser(apolloUser),
      container.resolve(MediaLibraryFinder).findSharedWithUser(apolloUser),
    ]);

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
        isSuperUser: sessionInfo.user.isSuperUser,
      },

      page: {
        libraries: {
          owned: ownedLibraries.map(lib => ({
            id: lib.id.toString(),
            name: lib.name,
            directoryUris: lib.directoryUris,
          })),
          sharedWith: sharedLibraries.map(lib => ({
            id: lib.id.toString(),
            name: lib.name,
          })),
        },
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

const media_management_get = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ libraryId: z.coerce.bigint() }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const databaseClient = container.resolve(DatabaseClient);
    const mediaLibraryFinder = container.resolve(MediaLibraryFinder);
    const userProvider = container.resolve(UserProvider);

    const mediaLibrary = await databaseClient.mediaLibrary.findUnique({
      where: { id: opts.input.libraryId },

      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,

        MediaLibrarySharedWith: {
          select: {
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (mediaLibrary == null || mediaLibrary.ownerId !== sessionInfo.user.id) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const apolloUser = await userProvider.findById(sessionInfo.user.id);
    if (apolloUser == null) {
      throw new Error('Unable to determine ApolloUser for the current session user');
    }
    const [ownedLibraries, sharedLibraries] = await Promise.all([
      mediaLibraryFinder.findOwnedByUser(apolloUser),
      mediaLibraryFinder.findSharedWithUser(apolloUser),
    ]);

    return {
      loggedInUser: {
        id: sessionInfo.user.id,
        displayName: sessionInfo.user.name,
        isSuperUser: sessionInfo.user.isSuperUser,
      },

      library: {
        id: mediaLibrary.id.toString(),
        name: mediaLibrary.name,
        directoryUris: mediaLibrary.directoryUris,
        sharedWith: mediaLibrary.MediaLibrarySharedWith.map(user => ({
          id: user.user.id,
          displayName: user.user.displayName,
        })),
      },
      libraries: {
        owned: ownedLibraries.map(lib => ({
          id: lib.id.toString(),
          name: lib.name,
          directoryUris: lib.directoryUris,
        })),
        sharedWith: sharedLibraries.map(lib => ({
          id: lib.id.toString(),
          name: lib.name,
        })),
      },
    };
  });

const media_management_list = oRpcBuilder
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

    const mediaLibraryFinder = container.resolve(MediaLibraryFinder);
    const userProvider = container.resolve(UserProvider);

    const apolloUser = await userProvider.findById(sessionInfo.user.id);
    if (apolloUser == null) {
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const [ownedLibraries, sharedLibraries] = await Promise.all([
      mediaLibraryFinder.findOwnedByUser(apolloUser),
      mediaLibraryFinder.findSharedWithUser(apolloUser),
    ]);

    return {
      loggedInUser: {
        id: sessionInfo.user.id,
        displayName: sessionInfo.user.name,
        isSuperUser: sessionInfo.user.isSuperUser,
      },

      libraries: {
        owned: ownedLibraries.map(lib => ({
          id: lib.id.toString(),
          name: lib.name,
          directoryUris: lib.directoryUris,
        })),
        sharedWith: sharedLibraries.map(lib => ({
          id: lib.id.toString(),
          name: lib.name,
        })),
      },
    };
  });

const media_management_delete = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ libraryId: z.coerce.bigint() }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const mediaLibraryFinder = container.resolve(MediaLibraryFinder);
    const databaseClient = container.resolve(DatabaseClient);

    const mediaLibrary = await mediaLibraryFinder.findById(opts.input.libraryId);
    if (mediaLibrary == null || mediaLibrary.ownerId !== sessionInfo.user.id) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    await databaseClient.mediaLibrary.delete({
      where: {
        id: opts.input.libraryId,
        ownerId: sessionInfo.user.id,
      },
    });

    return undefined;
  });

const media_management_createLibrary = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({
    name: z.string().nonempty().max(256).transform(s => s.trim().replaceAll(/\s{2,}/g, ' ')),
    directoryUris: z.array(z.string().nonempty().max(500)),
    sharedWithUserIds: z.array(z.string().trim().nonempty()),
  }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    if (opts.input.sharedWithUserIds.includes(sessionInfo.user.id)) {
      throw opts.errors.INVALID_INPUT({ message: 'Cannot share a media library with yourself' });
    }

    const userProvider = container.resolve(UserProvider);
    const fileProvider = container.resolve(FileProvider);
    const mediaLibraryWriter = container.resolve(MediaLibraryWriter);

    const apolloUser = await userProvider.findById(sessionInfo.user.id);
    if (apolloUser == null) {
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const directoryUris: ApolloFileURI[] = [];
    for (const rawDirectoryUri of opts.input.directoryUris) {
      let fileURI;
      try {
        fileURI = ApolloFileURI.parse(rawDirectoryUri);
        await fileProvider.provideForUserByUri(apolloUser, fileURI);
      } catch (err) {
        // TODO: Don't hardcode error message
        if (err instanceof Error &&
          (
            [
              'User does not have access to the requested file, or it does not exist',
              'The provided URL is not a ApolloFileUrl (does not start with /f/)',
              'The provided URL is not a ApolloFileUrl (missing userId and/or fileSystemId)',
            ].includes(err.message)
            || err.message.startsWith('Path segments cannot be empty: [')
          )
        ) {
          throw opts.errors.INVALID_INPUT({ message: `The provided directory URI is invalid or does not exist: ${rawDirectoryUri}` });
        }

        throw err;
      }

      directoryUris.push(fileURI);
    }

    return await mediaLibraryWriter.create(
      sessionInfo.user.id,
      opts.input.name,
      {
        directoryUris: directoryUris,
        sharedWithUserIds: opts.input.sharedWithUserIds,
      },
    );
  });

const media_management_updateLibrary = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({
    id: z.coerce.bigint(),
    name: z.string().nonempty().max(256).transform(s => s.trim().replaceAll(/\s{2,}/g, ' ')),
    directoryUris: z.array(z.string().nonempty().max(500)),
    sharedWithUserIds: z.array(z.string().trim().nonempty()),
  }))
  .handler(async (opts): Promise<undefined> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    if (opts.input.sharedWithUserIds.includes(sessionInfo.user.id)) {
      throw opts.errors.INVALID_INPUT({ message: 'Cannot share a media library with yourself' });
    }

    const userProvider = container.resolve(UserProvider);
    const fileProvider = container.resolve(FileProvider);
    const mediaLibraryFinder = container.resolve(MediaLibraryFinder);
    const mediaLibraryWriter = container.resolve(MediaLibraryWriter);

    const mediaLibrary = await mediaLibraryFinder.findById(opts.input.id);
    if (mediaLibrary == null || mediaLibrary.ownerId !== sessionInfo.user.id) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const apolloUser = await userProvider.findById(sessionInfo.user.id);
    if (apolloUser == null) {
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    const directoryUris: ApolloFileURI[] = [];
    for (const rawDirectoryUri of opts.input.directoryUris) {
      let fileURI;
      try {
        fileURI = ApolloFileURI.parse(rawDirectoryUri);
        await fileProvider.provideForUserByUri(apolloUser, fileURI);
      } catch (err) {
        // TODO: Don't hardcode error message
        if (err instanceof Error &&
          (
            [
              'User does not have access to the requested file, or it does not exist',
              'The provided URL is not a ApolloFileUrl (does not start with /f/)',
              'The provided URL is not a ApolloFileUrl (missing userId and/or fileSystemId)',
            ].includes(err.message)
            || err.message.startsWith('Path segments cannot be empty: [')
          )
        ) {
          throw opts.errors.INVALID_INPUT({ message: `The provided directory URI is invalid or does not exist: ${rawDirectoryUri}` });
        }

        throw err;
      }

      directoryUris.push(fileURI);
    }

    await mediaLibraryWriter.update(
      mediaLibrary.id,
      {
        name: opts.input.name,
        directoryUris,
        sharedWithUserIds: opts.input.sharedWithUserIds,
      },
    );

    return undefined;
  });

const media_management_unshare_myself_from_other = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ libraryId: z.coerce.bigint() }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const databaseClient = container.resolve(DatabaseClient);

    const deleteResult = await databaseClient.mediaLibrarySharedWith.deleteMany({
      where: {
        libraryId: opts.input.libraryId,
        userId: sessionInfo.user.id,
      },
    });

    if (deleteResult.count === 0) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    return undefined;
  });

const media_management_search_user_to_share_with = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ searchQuery: z.string().trim().nonempty().max(75) }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const databaseClient = container.resolve(DatabaseClient);

    const exactIdMatch = await databaseClient.authUser.findUnique({
      where: { id: opts.input.searchQuery },

      select: {
        id: true,
        displayName: true,
      },
    });

    const nameMatches = await databaseClient.authUser.findMany({
      where: {
        AND: [
          {
            displayName: {
              contains: opts.input.searchQuery,
              mode: 'insensitive',
            },
          },
          {
            mediaLibrarySharedWiths: {
              some: {
                library: {
                  ownerId: sessionInfo.user.id,
                },
              },
            },
          },
        ],
      },

      select: {
        id: true,
        displayName: true,
      },

      take: 20,
    });

    const allMatches = [
      ...(exactIdMatch != null ? [exactIdMatch] : []),
      ...nameMatches,
    ]
      .filter((user) => user.id !== sessionInfo.user.id);

    // Deduplicate by ID
    return Array.from(
      new Map(allMatches.map((user) => [user.id, user])).values(),
    );
  });

const media_management_debug_status_reindex = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts): Promise<boolean> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const fullLibraryIndexingHelper = container.resolve(FullLibraryIndexingHelper);
    const userProvider = container.resolve(UserProvider);

    const apolloUser = await userProvider.findById(sessionInfo.user.id);
    if (apolloUser == null) {
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    return fullLibraryIndexingHelper.isIndexingRunningForUser(apolloUser);
  });

const media_management_debug_start_full_reindex = oRpcBuilder
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

    const fullLibraryIndexingHelper = container.resolve(FullLibraryIndexingHelper);
    const userProvider = container.resolve(UserProvider);

    const apolloUser = await userProvider.findById(sessionInfo.user.id);
    if (apolloUser == null) {
      throw new Error('Unable to determine ApolloUser for the current session user');
    }

    if (fullLibraryIndexingHelper.isIndexingRunningForUser(apolloUser)) {
      throw opts.errors.INVALID_INPUT({ message: 'A full re-index is already running for this user' });
    }

    fullLibraryIndexingHelper.runForUser(apolloUser).catch(console.error);
  });

const user_settings_security_revokeSingleSession = oRpcBuilder
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
const user_settings_security_revokeAllSessionsExceptCurrent = oRpcBuilder
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

const user_get = oRpcBuilder
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

    return {
      id: sessionInfo.user.id,
      displayName: sessionInfo.user.name,
      isSuperUser: sessionInfo.user.isSuperUser,
    };
  });

const user_settings_profile_updateDisplayName = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ displayName: z.string().trim().nonempty().max(50) }))
  .handler(async (opts): Promise<undefined> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const databaseClient = container.resolve(DatabaseClient);

    await databaseClient.authUser.update({
      where: { id: sessionInfo.user.id },
      data: {
        displayName: opts.input.displayName,
      },
    });

    return undefined;
  });
const user_settings_profile_updateProfilePicture = oRpcBuilder
  .authenticated
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ file: z.instanceof(File).nullable() }))
  .handler(async (opts): Promise<undefined> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo == null || sessionInfo.user == null) {
      throw opts.errors.UNAUTHORIZED();
    }

    const databaseClient = container.resolve(DatabaseClient);
    const profilePictureProcessor = container.resolve(UploadedProfilePicturePreProcessor);

    let profilePictureBytes: Buffer | null;
    try {
      profilePictureBytes = opts.input.file != null
        ? await profilePictureProcessor.processForUserProfile(Buffer.from(await opts.input.file.arrayBuffer()))
        : null;
    } catch (err) {
      throw opts.errors.UNSUPPORTED_FILE();
    }

    await databaseClient.authUser.update({
      where: { id: sessionInfo.user.id },
      data: {
        profilePicture: profilePictureBytes != null ? Buffer.from(profilePictureBytes) : null,
      },
    });

    return undefined;
  });

const user_settings_security_get = oRpcBuilder
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

    const databaseClient = container.resolve(DatabaseClient);
    const oAuthConfigurationProvider = container.resolve(OAuthConfigurationProvider);
    const authSessionFinder = container.resolve(AuthSessionFinder);

    const linkedAuthProviders = await databaseClient.authUserLinkedProvider.findMany({
      where: {
        userId: sessionInfo.user.id,
      },
      select: {
        providerId: true,
        providerUserId: true,
        providerUserDisplayName: true,
        linkedAt: true,
      },
      orderBy: { providerId: 'asc' },
    });

    return {
      // TODO: Would be sick to change the profile picture system, so that we have something to send in loggedInUser too
      //       That would allow the user to update the profile picture in browser tab A, and see the new picture
      //       in browser tab B without a full page reloading
      loggedInUser: {
        id: sessionInfo.user.id,
        displayName: sessionInfo.user.name,
        isSuperUser: sessionInfo.user.isSuperUser,
      },

      sessions: {
        currentId: sessionInfo.session.id,
        all: await authSessionFinder.findByUserId(sessionInfo.user.id),
      },
      linkedAuthProviders: linkedAuthProviders.map((linkedProvider) => {
        const providerInfo: {
          identifier: string,
          displayName: string,
        } = oAuthConfigurationProvider.getProviderInfo(linkedProvider.providerId) ?? {
          identifiers: linkedProvider.providerId,
          displayName: linkedProvider.providerId,
        };

        return {
          ...providerInfo,
          providerUserId: linkedProvider.providerUserId,
          providerUserDisplayName: linkedProvider.providerUserDisplayName,
          linkedAt: linkedProvider.linkedAt,
        };
      }),
      allAuthProviderTypes: oAuthConfigurationProvider.getAvailableTypes().sort((a, b) => {
        return a.displayName.localeCompare(b.displayName);
      }),
    };
  });

const admin_users_list = oRpcBuilder
  .authenticatedAdmin
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo?.user.isSuperUser !== true) {
      throw new Error('Expected a SuperUser session on an authenticatedAdmin route');
    }

    const userProvider = container.resolve(UserProvider);
    const allUsers = await userProvider.findAll(true);

    return {
      loggedInUser: {
        id: sessionInfo.user.id,
        displayName: sessionInfo.user.name,
        isSuperUser: sessionInfo.user.isSuperUser,
      },

      users: allUsers.map((user) => ({
          id: user.id,
          displayName: user.displayName,
          blocked: user.blocked,
          isSuperUser: user.isSuperUser,
        }),
      ),
    };
  });

const admin_users_get = oRpcBuilder
  .authenticatedAdmin
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ id: z.string() }))
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo?.user.isSuperUser !== true) {
      throw new Error('Expected a SuperUser session on an authenticatedAdmin route');
    }

    const databaseClient = container.resolve(DatabaseClient);
    const oAuthConfigurationProvider = container.resolve(OAuthConfigurationProvider);

    const requestedUser = await databaseClient.authUser.findUnique({
      where: { id: opts.input.id },
      select: {
        id: true,
        displayName: true,
        blocked: true,
        isSuperUser: true,
        createdAt: true,
        lastLoginDate: true,
        lastActivityDate: true,
      },
    });
    if (requestedUser == null) {
      throw opts.errors.REQUESTED_ENTITY_NOT_FOUND();
    }

    const linkedAuthProviders = await databaseClient.authUserLinkedProvider.findMany({
      where: { userId: requestedUser.id },
      select: {
        providerId: true,
        providerUserId: true,
        providerUserDisplayName: true,
        linkedAt: true,
      },
      orderBy: { providerId: 'asc' },
    });

    return {
      loggedInUser: {
        id: sessionInfo.user.id,
        displayName: sessionInfo.user.name,
        isSuperUser: sessionInfo.user.isSuperUser,
      },

      user: {
        id: requestedUser.id,
        displayName: requestedUser.displayName,
        blocked: requestedUser.blocked,
        isSuperUser: requestedUser.isSuperUser,
        createdAt: requestedUser.createdAt,
        lastLoginDate: requestedUser.lastLoginDate,
        lastActivityDate: requestedUser.lastActivityDate,
      },
      linkedAuthProviders: linkedAuthProviders.map((linkedProvider) => {
        const providerInfo: {
          identifier: string,
          displayName: string,
        } = oAuthConfigurationProvider.getProviderInfo(linkedProvider.providerId) ?? {
          identifiers: linkedProvider.providerId,
          displayName: linkedProvider.providerId,
        };

        return {
          ...providerInfo,
          providerUserId: linkedProvider.providerUserId,
          providerUserDisplayName: linkedProvider.providerUserDisplayName,
          linkedAt: linkedProvider.linkedAt,
        };
      }),
    };
  });

const admin_users_updateBlock = oRpcBuilder
  .authenticatedAdmin
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ id: z.string(), block: z.boolean() }))
  .handler(async (opts): Promise<undefined> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo?.user.isSuperUser !== true) {
      throw new Error('Expected a SuperUser session on an authenticatedAdmin route');
    }

    if (opts.input.id === sessionInfo.user.id) {
      throw opts.errors.INVALID_INPUT({ message: 'You cannot (un-)block yourself' });
    }

    const databaseClient = container.resolve(DatabaseClient);
    databaseClient.$transaction(async (transaction) => {
      await transaction.authUser.update({
        where: {
          id: opts.input.id,
        },
        data: {
          blocked: opts.input.block,
        },
        select: { id: true },
      });

      await transaction.authSession.deleteMany({
        where: { userId: opts.input.id },
      });
    });

    return undefined;
  });

const admin_users_unlinkAuthProvider = oRpcBuilder
  .authenticatedAdmin
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.object({ id: z.string(), providerId: z.string() }))
  .handler(async (opts): Promise<undefined> => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo?.user.isSuperUser !== true) {
      throw new Error('Expected a SuperUser session on an authenticatedAdmin route');
    }

    const databaseClient = container.resolve(DatabaseClient);
    await databaseClient.authUserLinkedProvider.delete({
      where: {
        userId_providerId: {
          userId: opts.input.id,
          providerId: opts.input.providerId,
        },
      },
    });

    return undefined;
  });

const admin_accountCreationInvitation_create = oRpcBuilder
  .authenticatedAdmin
  .use(onError((err) => {
    if (!(err instanceof ORPCError)) {
      console.error(err);
    }
  }))
  .input(z.undefined())
  .handler(async (opts) => {
    const sessionInfo = opts.context.sessionInfo;
    if (sessionInfo?.user.isSuperUser !== true) {
      throw new Error('Expected a SuperUser session on an authenticatedAdmin route');
    }

    const accountCreationInviteCreator = container.resolve(AccountCreationInviteCreator);

    return {
      inviteToken: await accountCreationInviteCreator.create(),
    };
  });

export const oRpcRouter = {
  tmpBackend: {
    getConfig: tmpBackendConfig,
  },

  user: {
    get: user_get,

    settings: {
      profile: {
        updateDisplayName: user_settings_profile_updateDisplayName,
        updateProfilePicture: user_settings_profile_updateProfilePicture,
      },
      security: {
        get: user_settings_security_get,
        revokeSingleSession: user_settings_security_revokeSingleSession,
        revokeAllSessionsExceptCurrent: user_settings_security_revokeAllSessionsExceptCurrent,
      },
    },
  },

  session: {
    get: getSessionUser,
  },

  auth: {
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

    management: {
      get: media_management_get,
      list: media_management_list,

      delete: media_management_delete,
      createLibrary: media_management_createLibrary,
      updateLibrary: media_management_updateLibrary,
      unshareMyselfFromOther: media_management_unshare_myself_from_other,

      searchUserToShareWith: media_management_search_user_to_share_with,

      debug: {
        fullReIndexStatus: media_management_debug_status_reindex,
        startFullReIndex: media_management_debug_start_full_reindex,
      },
    },
  },

  // TODO: Move all admin oRPC routes to their own file and ensure only superusers can access them
  admin: {
    users: {
      list: admin_users_list,
      get: admin_users_get,
      updateBlock: admin_users_updateBlock,
      unlinkAuthProvider: admin_users_unlinkAuthProvider,
    },

    accountCreationInvitation: {
      create: admin_accountCreationInvitation_create,
    },

    debug: {
      collectDebugInfo: collectAdminDebugInfo,
    },
  },
};
