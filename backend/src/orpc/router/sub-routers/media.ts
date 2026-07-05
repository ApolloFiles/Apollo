import { injectable } from 'tsyringe';
import DatabaseClient from '../../../database/DatabaseClient.js';
import type * as PrismaClient from '../../../database/prisma-client/client.js';
import PermissionAwareFileProvider from '../../../files/provider/PermissionAwareFileProvider.js';
import AccessForbiddenError from '../../../permission/error/AccessForbiddenError.js';
import LibraryManager from '../../../plugins/official/media/_old/libraries/LibraryManager.js';
import ContinueWatchingProvider from '../../../plugins/official/media/library/ContinueWatchingProvider.js';
import HiddenFromOverviewMediaLibraryFinder
  from '../../../plugins/official/media/library/database/library/HiddenFromOverviewMediaLibraryFinder.js';
import HiddenFromSidebarMediaLibraryFinder
  from '../../../plugins/official/media/library/database/library/HiddenFromSidebarMediaLibraryFinder.js';
import MediaLibraryByUserFinder
  from '../../../plugins/official/media/library/database/library/MediaLibraryByUserFinder.js';
import MediaLibraryMediaFinder from '../../../plugins/official/media/library/database/media/MediaLibraryMediaFinder.js';
import MediaLibraryUserPreferences
  from '../../../plugins/official/media/library/database/user-preferences/MediaLibraryUserPreferences.js';
import MediaLibraryUserPreferencesFinder
  from '../../../plugins/official/media/library/database/user-preferences/MediaLibraryUserPreferencesFinder.js';
import MediaLibraryUserPreferencesWriter
  from '../../../plugins/official/media/library/database/writer/MediaLibraryUserPreferencesWriter.js';
import MediaLibraryWriter from '../../../plugins/official/media/library/database/writer/MediaLibraryWriter.js';
import FullLibraryIndexingHelper from '../../../plugins/official/media/library/FullLibraryIndexingHelper.js';
import MediaClearLogoImageProvider from '../../../plugins/official/media/library/images/MediaClearLogoImageProvider.js';
import PermissionAwareLibraryProvider
  from '../../../plugins/official/media/library/permission-aware/PermissionAwareLibraryProvider.js';
import ApolloFileURI from '../../../uri/ApolloFileURI.js';
import InvalidApolloFileURIError from '../../../uri/errors/InvalidApolloFileURIError.js';
import InvalidApolloURIError from '../../../uri/errors/InvalidApolloURIError.js';
import type ApolloUser from '../../../user/ApolloUser.js';
import type { ORpcContractOutputs } from '../../contract/oRpcContract.js';
import type { ORpcImplementer, SubRouter } from '../ORpcRouter.js';
import MediaEditorSubRouterFactory from './media/editor/MediaEditorSubRouterFactory.js';

@injectable()
export default class MediaORpcRouterFactory {
  constructor(
    private readonly mediaEditorSubRouterFactory: MediaEditorSubRouterFactory,
    private readonly databaseClient: DatabaseClient,
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
    private readonly mediaLibraryByUserFinder: MediaLibraryByUserFinder,
    private readonly fileProvider: PermissionAwareFileProvider,
    private readonly mediaLibraryWriter: MediaLibraryWriter,
    private readonly mediaClearLogoImageProvider: MediaClearLogoImageProvider,
    private readonly fullLibraryIndexingHelper: FullLibraryIndexingHelper,
    private readonly permissionAwareLibraryProvider: PermissionAwareLibraryProvider,
    private readonly mediaLibraryUserPreferencesFinder: MediaLibraryUserPreferencesFinder,
    private readonly mediaLibraryUserPreferencesWriter: MediaLibraryUserPreferencesWriter,
    private readonly hiddenFromOverviewMediaLibraryFinder: HiddenFromOverviewMediaLibraryFinder,
    private readonly hiddenFromSidebarMediaLibraryFinder: HiddenFromSidebarMediaLibraryFinder,
    private readonly continueWatchingProvider: ContinueWatchingProvider,
  ) {
  }

  create(os: ORpcImplementer['media']): SubRouter<'media'> {
    return {
      ...this.mediaEditorSubRouterFactory.create(os),

      // FIXME: getMediaLibraryOverview still heavily relies on old code
      getMediaLibraryOverview: os.getMediaLibraryOverview
        .handler(async ({ input, context }) => {
          const mediaLibrary = input.libraryId != null ? (await this.permissionAwareLibraryProvider.provideForReadContents(input.libraryId, context.authSession.user)) : null;

          type MediaElement = {
            title: string,
            libraryId: string,
            mediaId: string,
            year: number | null,
          }

          type ContinueWatchingElement = MediaElement & {
            mediaItemId: string,
            watchProgressPercentage?: number,
            seasonNumber?: number,
            episodeNumber?: number,
          };

          const libraryManager = new LibraryManager(context.authSession.user);

          let libraryMediaSorting: ORpcContractOutputs['media']['getMediaLibraryOverview']['page']['result']['order'];
          let mediaItems: Promise<PrismaClient.MediaLibraryMedia[]>;

          if (mediaLibrary != null) {
            if (input.order === 'alphabetical') {
              libraryMediaSorting = 'alphabetical';
              mediaItems = libraryManager.fetchMediaSortedAlphabetically(mediaLibrary.library.id);
            } else {
              libraryMediaSorting = 'recentlyAdded';
              mediaItems = libraryManager.fetchMediaSortedByRecentlyAdded(mediaLibrary.library.id);
            }
          } else {
            libraryMediaSorting = 'recentlyAdded';
            mediaItems = libraryManager.fetchRecentlyAddedMediaExcludingSome(await this.hiddenFromOverviewMediaLibraryFinder.findLibraryIds(context.authSession.user.id));
          }

          const mediaResultItems: ORpcContractOutputs['media']['getMediaLibraryOverview']['page']['result']['items'] = (await mediaItems).map(i => ({
            title: i.title,
            libraryId: i.libraryId.toString(),
            mediaId: i.id.toString(),
            year: i.year,
          }));

          return {
            loggedInUser: {
              id: context.authSession.user.id,
              csrfToken: context.authSession.csrfToken,
              displayName: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
              uiLanguage: context.authSession.user.uiLanguage,
            },

            page: {
              libraries: await this.collectLibrariesData(context.authSession.user),
              continueWatching: ((await this.continueWatchingProvider.listForOverview(context.authSession.user, mediaLibrary?.library.id ?? null)).map(i => ({
                title: i.mediaTitle,
                watchProgressPercentage: this.watchProgressPercentage(i.watchProgressInSec, i.item.durationInSec),
                libraryId: i.libraryId.toString(),
                mediaId: i.mediaId.toString(),
                mediaItemId: i.item.id.toString(),
                seasonNumber: i.item.seasonNumber ?? undefined,
                episodeNumber: i.item.episodeNumber ?? undefined,
                year: i.mediaYear,
              }))) satisfies ContinueWatchingElement[],

              result: {
                order: libraryMediaSorting,
                items: mediaResultItems,
              },
            },
          };
        }),

      searchMedia: os.searchMedia
        .handler(async ({ input, context }) => {
          const accessibleLibraryIds = await this.mediaLibraryByUserFinder.findAccessibleLibraryIds(context.authSession.user.id);
          const matches = await this.mediaLibraryMediaFinder.searchByTitle(accessibleLibraryIds, input.query);

          return {
            loggedInUser: {
              id: context.authSession.user.id,
              csrfToken: context.authSession.csrfToken,
              displayName: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
              uiLanguage: context.authSession.user.uiLanguage,
            },

            page: {
              libraries: await this.collectLibrariesData(context.authSession.user),
              query: input.query,
              results: matches.map(match => ({
                title: match.title,
                libraryId: match.libraryId.toString(),
                libraryName: match.libraryName,
                mediaId: match.id.toString(),
                year: match.year,
              })),
            },
          };
        }),

      getMedia: os.getMedia
        .handler(async ({ input, context }) => {
          const mediaLibrary = await this.permissionAwareLibraryProvider.provideForReadContents(input.libraryId, context.authSession.user);
          const libraryMedia = await mediaLibrary.findMedia(input.mediaId);

          let mediaHasClearLogoPromise: boolean;
          {
            const fullLibraryMedia = await this.mediaLibraryMediaFinder.findFullById(libraryMedia.media.id);
            mediaHasClearLogoPromise = (await this.mediaClearLogoImageProvider.provide(fullLibraryMedia!, 'avif')) != null;
          }

          const seasonsMap: Map<number, SeasonData> = new Map();
          for (const item of (await libraryMedia.findAllItems())) {
            const seasonNumber = item.seasonNumber ?? 0;
            if (!seasonsMap.has(seasonNumber)) {
              seasonsMap.set(seasonNumber, {
                seasonNumber: seasonNumber,
                episodes: [],
              });
            }

            const watchProgress = await this.databaseClient.mediaLibraryUserWatchProgress.findUnique({
              where: {
                userId_mediaItemId: {
                  userId: context.authSession.user.id,
                  mediaItemId: item.id,
                },
              },
              select: {
                durationInSec: true,
              },
            });
            const watchProgressInSec = watchProgress ? watchProgress.durationInSec : null;

            seasonsMap.get(seasonNumber)!.episodes.push({
              id: item.id.toString(),
              episodeNumber: item.episodeNumber ?? 0,
              title: item.title,
              synopsis: item.synopsis,
              durationInSeconds: item.durationInSec,
              watchProgress: watchProgressInSec != null ? {
                inSeconds: watchProgressInSec,
                asPercentage: this.watchProgressPercentage(watchProgressInSec, item.durationInSec),
              } : null,
            });
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
            year: number | null,
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

          const continueWatchingResultItem = await this.continueWatchingProvider.resolveNextForMedia(context.authSession.user, libraryMedia.media.id);
          let nextMediaItemToWatch: MediaDetail['nextMediaItemToWatch'] = continueWatchingResultItem != null ? {
            id: continueWatchingResultItem.item.id.toString(),
            title: continueWatchingResultItem.item.title,
            synopsis: continueWatchingResultItem.item.synopsis,
            episodeNumber: continueWatchingResultItem.item.episodeNumber ?? 0,
            durationInSeconds: continueWatchingResultItem.item.durationInSec,
            watchProgress: {
              inSeconds: continueWatchingResultItem.watchProgressInSec,
              asPercentage: this.watchProgressPercentage(continueWatchingResultItem.watchProgressInSec, continueWatchingResultItem.item.durationInSec),
            },
          } : null;

          return {
            loggedInUser: {
              id: context.authSession.user.id,
              csrfToken: context.authSession.csrfToken,
              displayName: context.authSession.user.displayName,
              isSuperUser: context.authSession.user.isSuperUser,
              uiLanguage: context.authSession.user.uiLanguage,
            },

            page: {
              libraries: await this.collectLibrariesData(context.authSession.user),
              media: {
                id: libraryMedia.media.id.toString(),
                type: (seasonsMap.size > 1 || !seasonsMap.has(0)) ? 'tv_show' : 'movie',
                title: libraryMedia.media.title,
                synopsis: libraryMedia.media.synopsis,
                year: libraryMedia.media.year,
                hasClearLogo: await mediaHasClearLogoPromise,
                genres: [],
                nextMediaItemToWatch,
                seasons,
              } satisfies MediaDetail,
            },
          };
        }),

      markWatched: os.markWatched
        .handler(async ({ input, context, errors }) => {
          const mediaLibrary = await this.permissionAwareLibraryProvider.provideForReadContents(input.libraryId, context.authSession.user);
          const libraryMedia = await mediaLibrary.findMedia(input.mediaId);
          const item = await libraryMedia.findItem(input.mediaItemId);
          if (item == null) {
            throw errors.REQUESTED_ENTITY_NOT_FOUND();
          }

          const userId = context.authSession.user.id;
          await this.databaseClient.mediaLibraryUserWatchProgress.upsert({
            where: { userId_mediaItemId: { userId, mediaItemId: item.id } },
            update: { durationInSec: item.durationInSec },
            create: { userId, mediaItemId: item.id, durationInSec: item.durationInSec },
          });
        }),

      removeWatchProgress: os.removeWatchProgress
        .handler(async ({ input, context, errors }) => {
          const mediaLibrary = await this.permissionAwareLibraryProvider.provideForReadContents(input.libraryId, context.authSession.user);
          const libraryMedia = await mediaLibrary.findMedia(input.mediaId);
          const item = await libraryMedia.findItem(input.mediaItemId);
          if (item == null) {
            throw errors.REQUESTED_ENTITY_NOT_FOUND();
          }

          await this.databaseClient.mediaLibraryUserWatchProgress.deleteMany({
            where: { userId: context.authSession.user.id, mediaItemId: item.id },
          });
        }),

      management: {
        get: os.management.get
          .handler(async ({ input, context }) => {
            let library: ORpcContractOutputs['media']['management']['get']['library'];

            const mediaLibrary = await this.permissionAwareLibraryProvider.provideForReadContents(input.libraryId, context.authSession.user);
            library = {
              canManage: false,
              id: mediaLibrary.library.id.toString(),
              name: mediaLibrary.library.name,
            };

            try {
              const mediaLibrary = await this.permissionAwareLibraryProvider.provideForWrite(input.libraryId, context.authSession.user);
              library = {
                canManage: true,
                id: mediaLibrary.id.toString(),
                name: mediaLibrary.name,
                directoryUris: mediaLibrary.directoryUris,
                sharedWith: mediaLibrary.sharedWithUsers.map(user => ({
                  id: user.id,
                  displayName: user.displayName,
                })),
              };
            } catch (err) {
              if (!(err instanceof AccessForbiddenError)) {
                // only ignore AccessForbiddenError
                throw err;
              }
            }

            return {
              loggedInUser: {
                id: context.authSession.user.id,
                csrfToken: context.authSession.csrfToken,
                displayName: context.authSession.user.displayName,
                isSuperUser: context.authSession.user.isSuperUser,
                uiLanguage: context.authSession.user.uiLanguage,
              },

              library,
              libraryUserPreferences: await this.mediaLibraryUserPreferencesFinder.findByLibraryAndUser(mediaLibrary.library.id, context.authSession.user.id),
              libraries: await this.collectLibrariesData(context.authSession.user),
            };
          }),

        list: os.management.list
          .handler(async ({ context }) => {
            return {
              loggedInUser: {
                id: context.authSession.user.id,
                csrfToken: context.authSession.csrfToken,
                displayName: context.authSession.user.displayName,
                isSuperUser: context.authSession.user.isSuperUser,
                uiLanguage: context.authSession.user.uiLanguage,
              },

              libraries: await this.collectLibrariesData(context.authSession.user),
            };
          }),

        delete: os.management.delete
          .handler(async ({ input, context }) => {
            const mediaLibrary = await this.permissionAwareLibraryProvider.provideForWrite(input.libraryId, context.authSession.user);

            await this.databaseClient.mediaLibrary.delete({
              where: {
                id: mediaLibrary.id,
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
                const file = await this.fileProvider.provideForRead(fileURI, context.authSession.user);
                if (file.fileSystem.owner?.id !== fileURI.userId) {
                  throw errors.INVALID_INPUT({ message: 'You are not the owner of the requested file' });
                }
              } catch (err) {
                if (err instanceof InvalidApolloURIError || err instanceof InvalidApolloFileURIError) {
                  throw errors.INVALID_INPUT({ message: `The provided ApolloFileURI is invalid: ` + err.message });
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

            const mediaLibrary = await this.permissionAwareLibraryProvider.provideForWrite(input.id, context.authSession.user);

            const directoryUris: ApolloFileURI[] = [];
            for (const rawDirectoryUri of input.directoryUris) {
              let fileURI;
              try {
                fileURI = ApolloFileURI.parse(rawDirectoryUri);
                const file = await this.fileProvider.provideForRead(fileURI, context.authSession.user);
                if (file.fileSystem.owner?.id !== fileURI.userId) {
                  throw errors.INVALID_INPUT({ message: 'You are not the owner of the requested file' });
                }
              } catch (err) {
                if (err instanceof InvalidApolloURIError || err instanceof InvalidApolloFileURIError) {
                  throw errors.INVALID_INPUT({ message: `The provided ApolloFileURI is invalid: ` + err.message });
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

        updateLibraryUserPreferences: os.management.updateLibraryUserPreferences
          .handler(async ({ input, context }) => {
            const userId = context.authSession.user.id;
            const libraryId = input.libraryId;
            const preferences = input.preferences;

            await this.mediaLibraryUserPreferencesWriter.update(userId, libraryId, new MediaLibraryUserPreferences(preferences.hideFromOverview, preferences.hideFromSidebar));
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
            // TODO: rate-limit to hinder userId enumeration (which might expose display names etc.; They are public info but I think a rate-limit would still make sense)
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

  private async collectLibrariesData(user: ApolloUser): Promise<ORpcContractOutputs['media']['getMediaLibraryOverview']['page']['libraries']> {
    const [ownedLibraries, sharedLibraries, hiddenFromSidebarIds] = await Promise.all([
      this.mediaLibraryByUserFinder.findOwnedSortedByName(user.id),
      this.mediaLibraryByUserFinder.findSharedSortedByName(user.id),
      this.hiddenFromSidebarMediaLibraryFinder.findLibraryIds(user.id),
    ]);
    const hiddenFromSidebarSet = new Set(hiddenFromSidebarIds);

    return {
      owned: ownedLibraries.map(lib => ({
        id: lib.id.toString(),
        name: lib.name,
        hideFromSidebar: hiddenFromSidebarSet.has(lib.id),
      })),
      sharedWith: sharedLibraries.map(lib => ({
        id: lib.id.toString(),
        name: lib.name,
        hideFromSidebar: hiddenFromSidebarSet.has(lib.id),
      })),
    };
  }

  /**
   * Watch-progress ratio in the range [0, 1] (`watchedSec / durationSec`), guarded against a
   * zero/negative duration.
   */
  private watchProgressPercentage(watchedSec: number, durationSec: number): number {
    if (durationSec <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, watchedSec / durationSec));
  }
}
