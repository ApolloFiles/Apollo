import { injectable } from 'tsyringe';
import DatabaseClient from '../../../../database/DatabaseClient.js';
import type * as PrismaClient from '../../../../database/prisma-client/client.js';
import FileProvider from '../../../../files/FileProvider.js';
import LibraryManager from '../../../../plugins/official/media/_old/libraries/LibraryManager.js';
import MediaLibraryFinder from '../../../../plugins/official/media/library/database/finder/MediaLibraryFinder.js';
import MediaLibraryMediaFinder
  from '../../../../plugins/official/media/library/database/finder/MediaLibraryMediaFinder.js';
import MediaLibraryWriter from '../../../../plugins/official/media/library/database/writer/MediaLibraryWriter.js';
import FullLibraryIndexingHelper from '../../../../plugins/official/media/library/FullLibraryIndexingHelper.js';
import MediaClearLogoImageProvider
  from '../../../../plugins/official/media/library/images/MediaClearLogoImageProvider.js';
import ApolloFileURI from '../../../../uri/ApolloFileURI.js';
import type { ORpcContractOutputs } from '../../contract/oRpcContract.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';

@injectable()
export default class MediaORpcRouterFactory {
  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly mediaLibraryFinder: MediaLibraryFinder,
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
    private readonly fileProvider: FileProvider,
    private readonly mediaLibraryWriter: MediaLibraryWriter,
    private readonly mediaClearLogoImageProvider: MediaClearLogoImageProvider,
    private readonly fullLibraryIndexingHelper: FullLibraryIndexingHelper,
  ) {
  }

  create(os: ORpcImplementer['media']): SubRouter<'media'> {
    return {
      getMediaLibraryOverview: os.getMediaLibraryOverview
        .handler(async ({ input, context }) => {
          const libraryIdToFilterBy = input.libraryId;

          const [ownedLibraries, sharedLibraries] = await Promise.all([
            this.mediaLibraryFinder.findOwnedByUser(context.authSession.user),
            this.mediaLibraryFinder.findSharedWithUser(context.authSession.user),
          ]);

          const libraryManager = new LibraryManager(context.authSession.user);

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

          let libraryMediaSorting: ORpcContractOutputs['media']['getMediaLibraryOverview']['page']['result']['order'];
          let mediaItems: Promise<PrismaClient.MediaLibraryMedia[]>;

          if (libraryIdToFilterBy != null) {
            if (input.order === 'alphabetical') {
              libraryMediaSorting = 'alphabetical';
              mediaItems = libraryManager.fetchMediaSortedAlphabetically(libraryIdToFilterBy);
            } else {
              libraryMediaSorting = 'recentlyAdded';
              mediaItems = libraryManager.fetchMediaSortedByRecentlyAdded(libraryIdToFilterBy);
            }
          } else {
            libraryMediaSorting = 'recentlyAdded';
            mediaItems = libraryManager.fetchRecentlyAddedMedia(libraryIdToFilterBy);
          }

          const mediaResultItems: ORpcContractOutputs['media']['getMediaLibraryOverview']['page']['result']['items'] = (await mediaItems).map(i => ({
            title: i.title,
            libraryId: i.libraryId.toString(),
            mediaId: i.id.toString(),
          }));

          return {
            loggedInUser: {
              id: context.authSession.user.id,
              displayName: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
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

              result: {
                order: libraryMediaSorting,
                items: mediaResultItems,
              },
            },
          };
        }),

      getMedia: os.getMedia
        .handler(async ({ input, context, errors }) => {
          const libraryId = input.libraryId;
          const mediaId = input.mediaId;

          const libraryManager = new LibraryManager(context.authSession.user);

          const library = await libraryManager.getLibrary(libraryId.toString());
          if (library == null) {
            throw errors.REQUESTED_ENTITY_NOT_FOUND();
          }

          const media = await library.fetchMediaFull(mediaId);
          if (media == null) {
            throw errors.REQUESTED_ENTITY_NOT_FOUND();
          }

          const mediaHasClearLogoPromise = this.mediaLibraryMediaFinder
            .findForUserById(context.authSession.user, mediaId)
            .then((mediaFromOtherFinder) => {
              if (mediaFromOtherFinder == null) {
                throw new Error('Unexpected null media when checking for clear logo');
              }

              return this.mediaClearLogoImageProvider.provide(mediaFromOtherFinder!, 'avif');
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
            this.mediaLibraryFinder.findOwnedByUser(context.authSession.user),
            this.mediaLibraryFinder.findSharedWithUser(context.authSession.user),
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
              id: context.authSession.user.id,
              displayName: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
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
        }),

      management: {
        get: os.management.get
          .handler(async ({ input, context, errors }) => {
            const mediaLibrary = await this.databaseClient.mediaLibrary.findUnique({
              where: { id: input.libraryId },

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

            if (mediaLibrary == null || mediaLibrary.ownerId !== context.authSession.user.id) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }

            const [ownedLibraries, sharedLibraries] = await Promise.all([
              this.mediaLibraryFinder.findOwnedByUser(context.authSession.user),
              this.mediaLibraryFinder.findSharedWithUser(context.authSession.user),
            ]);

            return {
              loggedInUser: {
                id: context.authSession.user.id,
                displayName: context.authSession.user.displayName,
                isSuperUser: context.authSession.user.isSuperUser,
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
          }),

        list: os.management.list
          .handler(async ({ context }) => {
            const [ownedLibraries, sharedLibraries] = await Promise.all([
              this.mediaLibraryFinder.findOwnedByUser(context.authSession.user),
              this.mediaLibraryFinder.findSharedWithUser(context.authSession.user),
            ]);

            return {
              loggedInUser: {
                id: context.authSession.user.id,
                displayName: context.authSession.user.displayName,
                isSuperUser: context.authSession.user.isSuperUser,
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
          }),

        delete: os.management.delete
          .handler(async ({ input, context, errors }) => {
            const mediaLibrary = await this.mediaLibraryFinder.findById(input.libraryId);
            if (mediaLibrary == null || mediaLibrary.ownerId !== context.authSession.user.id) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }

            await this.databaseClient.mediaLibrary.delete({
              where: {
                id: input.libraryId,
                ownerId: context.authSession.user.id,
              },
            });
          }),

        createLibrary: os.management.createLibrary
          .handler(async ({ input, context, errors }) => {
            if (input.sharedWithUserIds.includes(context.authSession.user.id)) {
              throw errors.INVALID_INPUT({ message: 'Cannot share a media library with yourself' });
            }

            const directoryUris: ApolloFileURI[] = [];
            for (const rawDirectoryUri of input.directoryUris) {
              let fileURI;
              try {
                fileURI = ApolloFileURI.parse(rawDirectoryUri);
                await this.fileProvider.provideForUserByUri(context.authSession.user, fileURI);
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
                  throw errors.INVALID_INPUT({ message: `The provided directory URI is invalid or does not exist: ${rawDirectoryUri}` });
                }

                throw err;
              }

              directoryUris.push(fileURI);
            }

            return await this.mediaLibraryWriter.create(
              context.authSession.user.id,
              input.name,
              {
                directoryUris: directoryUris,
                sharedWithUserIds: input.sharedWithUserIds,
              },
            );
          }),

        updateLibrary: os.management.updateLibrary
          .handler(async ({ input, context, errors }) => {
            if (input.sharedWithUserIds.includes(context.authSession.user.id)) {
              throw errors.INVALID_INPUT({ message: 'Cannot share a media library with yourself' });
            }

            const mediaLibrary = await this.mediaLibraryFinder.findById(input.id);
            if (mediaLibrary == null || mediaLibrary.ownerId !== context.authSession.user.id) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }

            const directoryUris: ApolloFileURI[] = [];
            for (const rawDirectoryUri of input.directoryUris) {
              let fileURI;
              try {
                fileURI = ApolloFileURI.parse(rawDirectoryUri);
                await this.fileProvider.provideForUserByUri(context.authSession.user, fileURI);
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
                  throw errors.INVALID_INPUT({ message: `The provided directory URI is invalid or does not exist: ${rawDirectoryUri}` });
                }

                throw err;
              }

              directoryUris.push(fileURI);
            }

            await this.mediaLibraryWriter.update(
              mediaLibrary.id,
              {
                name: input.name,
                directoryUris,
                sharedWithUserIds: input.sharedWithUserIds,
              },
            );
          }),

        unshareMyselfFromOther: os.management.unshareMyselfFromOther
          .handler(async ({ input, context, errors }) => {
            const deleteResult = await this.databaseClient.mediaLibrarySharedWith.deleteMany({
              where: {
                libraryId: input.libraryId,
                userId: context.authSession.user.id,
              },
            });

            if (deleteResult.count === 0) {
              throw errors.REQUESTED_ENTITY_NOT_FOUND();
            }
          }),

        searchUserToShareWith: os.management.searchUserToShareWith
          .handler(async ({ input, context }) => {
            const exactIdMatch = await this.databaseClient.authUser.findUnique({
              where: { id: input.searchQuery },

              select: {
                id: true,
                displayName: true,
              },
            });

            // TODO: Also search shared-libs in the other direction ('the user sharing with me')
            const nameMatches = await this.databaseClient.authUser.findMany({
              where: {
                AND: [
                  {
                    displayName: {
                      contains: input.searchQuery,
                      mode: 'insensitive',
                    },
                  },
                  {
                    mediaLibrarySharedWiths: {
                      some: {
                        library: {
                          ownerId: context.authSession.user.id,
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
              .filter((user) => user.id !== context.authSession.user.id);

            // Deduplicate by ID
            return Array.from(
              new Map(allMatches.map((user) => [user.id, user])).values(),
            );
          }),

        debug: {
          fullReIndexStatus: os.management.debug.fullReIndexStatus
            .handler(async ({ context }) => {
              return this.fullLibraryIndexingHelper.isIndexingRunningForUser(context.authSession.user);
            }),

          startFullReIndex: os.management.debug.startFullReIndex
            .handler(async ({ context, errors }) => {
              if (this.fullLibraryIndexingHelper.isIndexingRunningForUser(context.authSession.user)) {
                throw errors.INVALID_INPUT({ message: 'A full re-index is already running for this user' });
              }

              this.fullLibraryIndexingHelper.runForUser(context.authSession.user).catch(console.error);
            }),
        },
      },
    };
  }
}
