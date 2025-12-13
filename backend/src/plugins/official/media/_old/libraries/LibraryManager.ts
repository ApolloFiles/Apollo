import { container } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type * as PrismaClient from '../../../../../database/prisma-client/client.js';
import type { MediaLibraryFindManyArgs } from '../../../../../database/prisma-client/models.js';
import FileProvider from '../../../../../files/FileProvider.js';
import type LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import ApolloFileURI from '../../../../../url/ApolloFileURI.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import UserProvider from '../../../../../user/UserProvider.js';
import MediaLibraryMediaItemFinder from '../library/MediaLibraryMediaItem/MediaLibraryMediaItemFinder.js';
import Library from './Library.js';

type ContinueWatchingResultItem = {
  media: PrismaClient.MediaLibraryMedia,
  item: Pick<PrismaClient.MediaLibraryMediaItem, 'id' | 'durationInSec' | 'seasonNumber' | 'episodeNumber'>,
  watchProgressInSec: number,
}

export default class LibraryManager {
  private readonly user: ApolloUser;

  private readonly databaseClient = container.resolve(DatabaseClient);
  private readonly userProvider = container.resolve(UserProvider);
  private readonly fileProvider = container.resolve(FileProvider);
  private readonly mediaLibraryMediaItemFinder = container.resolve(MediaLibraryMediaItemFinder);

  private readonly FILTER_LIBRARY_FOR_USER: MediaLibraryFindManyArgs['where'];

  constructor(user: ApolloUser) {
    this.user = user;

    this.FILTER_LIBRARY_FOR_USER = {
      OR: [
        {
          ownerId: this.user.id,
        },
        {
          MediaLibrarySharedWith: {
            some: { userId: this.user.id },
          },
        },
      ],
    };
  }

  async getLibrary(libraryId: string): Promise<Library | null> {
    const library = await this.databaseClient.mediaLibrary.findUnique({
      where: {
        ...this.FILTER_LIBRARY_FOR_USER,
        id: BigInt(libraryId),
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
        MediaLibrarySharedWith: {
          select: {
            userId: true,
          },
        },
      },
    });
    if (library == null) {
      return null;
    }

    let user: ApolloUser | null = this.user;
    if (library.ownerId !== this.user.id) {
      user = await this.userProvider.provideByAuthId(library.ownerId);
    }
    if (user == null) {
      throw new Error('Library is owned by a user that does not exist');
    }

    return new Library(
      user,
      library.id.toString(),
      library.name,
      library.MediaLibrarySharedWith.map(v => Number(v.userId)),
      await this.mapLibraryPathUrisToUserFile(library.directoryUris),
    );
  }

  async getLibraries(): Promise<Library[]> {
    const libraries = await this.databaseClient.mediaLibrary.findMany({
      where: this.FILTER_LIBRARY_FOR_USER,
      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
        MediaLibrarySharedWith: {
          select: {
            userId: true,
          },
        },
      },
    });

    const result: Library[] = [];
    for (const library of libraries) {
      let user: ApolloUser | null = this.user;
      if (library.ownerId !== this.user.id) {
        user = await this.userProvider.provideByAuthId(library.ownerId);
      }
      if (user == null) {
        throw new Error('Library is owned by a user that does not exist');
      }

      result.push(new Library(
        user,
        library.id.toString(),
        library.name, library.MediaLibrarySharedWith.map(v => Number(v.userId)),
        await this.mapLibraryPathUrisToUserFile(library.directoryUris),
      ));
    }

    return result;
  }

  async fetchRecentlyAddedMedia(libraryIdToFilterBy?: bigint, limit = 12): Promise<PrismaClient.MediaLibraryMedia[]> {
    const libraryIdsUserHasAccessTo = await this.findLibraryIds();
    if (libraryIdToFilterBy != null && !libraryIdsUserHasAccessTo.includes(libraryIdToFilterBy)) {
      console.warn(`[WARN] 'Recently added' requested for a library the user has no access to`);
      return [];
    }

    return this.databaseClient.mediaLibraryMedia.findMany({
      where: {
        libraryId: libraryIdToFilterBy != null ? { equals: libraryIdToFilterBy } : { in: libraryIdsUserHasAccessTo },
      },
      orderBy: {
        addedAt: 'desc',
      },
      take: limit,
    });
  }

  // TODO: This costly operation should be cached (at least right now it is costly)
  async fetchContinueWatchingItems(libraryIdToFilterBy?: bigint, limit = 12): Promise<ContinueWatchingResultItem[]> {
    const result: ContinueWatchingResultItem[] = [];

    const libraryIdsUserHasAccessTo = await this.findLibraryIds();
    if (libraryIdToFilterBy != null && !libraryIdsUserHasAccessTo.includes(libraryIdToFilterBy)) {
      console.warn(`[WARN] 'Continue watching' requested for a library the user has no access to`);
      return [];
    }

    const watchProgressItems = await this.databaseClient
      .mediaLibraryUserWatchProgress
      .findMany({
        where: {
          mediaItem: {
            media: {
              libraryId: libraryIdToFilterBy != null ? { equals: libraryIdToFilterBy } : { in: libraryIdsUserHasAccessTo },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 100, // TODO: Maybe use a cursor instead

        select: {
          durationInSec: true,
          mediaItem: {
            select: {
              id: true,
              durationInSec: true,
              seasonNumber: true,
              episodeNumber: true,
              media: true,
            },
          },
        },
      });

    const seenMediaIds: bigint[] = [];
    for (const watchProgressItem of watchProgressItems) {
      if (result.length >= limit) {
        break;
      }
      if (seenMediaIds.includes(watchProgressItem.mediaItem.media.id)) {
        continue;
      }

      seenMediaIds.push(watchProgressItem.mediaItem.media.id);

      const itemIsWatchedFully = watchProgressItem.mediaItem.durationInSec - watchProgressItem.durationInSec <= 120;
      if (!itemIsWatchedFully) {
        result.push({
          media: watchProgressItem.mediaItem.media,
          item: {
            id: watchProgressItem.mediaItem.id,
            durationInSec: watchProgressItem.mediaItem.durationInSec,
            seasonNumber: watchProgressItem.mediaItem.seasonNumber,
            episodeNumber: watchProgressItem.mediaItem.episodeNumber,
          },
          watchProgressInSec: watchProgressItem.durationInSec,
        });

        continue;
      }

      const surroundingMediaItems = await this.mediaLibraryMediaItemFinder.findSurroundingMediaItems(watchProgressItem.mediaItem.id, watchProgressItem.mediaItem.media.id);
      if (surroundingMediaItems.next != null) {
        result.push({
          media: watchProgressItem.mediaItem.media,
          item: await this.databaseClient.mediaLibraryMediaItem.findUniqueOrThrow({
            where: { id: surroundingMediaItems.next.id },
            select: {
              id: true,
              durationInSec: true,
              seasonNumber: true,
              episodeNumber: true,
            },
          }),
          watchProgressInSec: watchProgressItem.durationInSec,
        });
      }
    }

    return result;
  }

  async determineContinueOrNextWatchItemForMedia(mediaId: bigint): Promise<ContinueWatchingResultItem & {
    item: { title: string, synopsis: string | null }
  } | null> {
    const watchProgressItem = await this.databaseClient
      .mediaLibraryUserWatchProgress
      .findFirst({
        where: {
          mediaItem: {
            media: {
              id: { equals: mediaId },
              libraryId: { in: await this.findLibraryIds() },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },

        select: {
          durationInSec: true,
          mediaItem: {
            select: {
              id: true,
              title: true,
              synopsis: true,
              durationInSec: true,
              seasonNumber: true,
              episodeNumber: true,
              media: true,
            },
          },
        },
      });

    if (watchProgressItem == null) {
      const firstItem = await this.databaseClient
        .mediaLibraryMediaItem
        .findFirst({
          where: {
            media: {
              id: { equals: mediaId },
              libraryId: { in: await this.findLibraryIds() },
            },
          },
          orderBy: [
            { seasonNumber: 'asc' },
            { episodeNumber: 'asc' },
          ],
          select: {
            id: true,
            title: true,
            synopsis: true,
            durationInSec: true,
            seasonNumber: true,
            episodeNumber: true,
            media: true,
          },
        });

      if (firstItem == null) {
        return null;
      }

      return {
        media: firstItem.media,
        item: {
          id: firstItem.id,
          title: firstItem.title,
          synopsis: firstItem.synopsis,
          durationInSec: firstItem.durationInSec,
          seasonNumber: firstItem.seasonNumber,
          episodeNumber: firstItem.episodeNumber,
        },
        watchProgressInSec: 0,
      };
    }

    const itemIsWatchedFully = watchProgressItem.mediaItem.durationInSec - watchProgressItem.durationInSec <= 120;
    if (!itemIsWatchedFully) {
      return {
        media: watchProgressItem.mediaItem.media,
        item: {
          id: watchProgressItem.mediaItem.id,
          title: watchProgressItem.mediaItem.title,
          synopsis: watchProgressItem.mediaItem.synopsis,
          durationInSec: watchProgressItem.mediaItem.durationInSec,
          seasonNumber: watchProgressItem.mediaItem.seasonNumber,
          episodeNumber: watchProgressItem.mediaItem.episodeNumber,
        },
        watchProgressInSec: watchProgressItem.durationInSec,
      };
    }

    const surroundingMediaItems = await this.mediaLibraryMediaItemFinder.findSurroundingMediaItems(watchProgressItem.mediaItem.id, watchProgressItem.mediaItem.media.id);
    if (surroundingMediaItems.next != null) {
      return {
        media: watchProgressItem.mediaItem.media,
        item: await this.databaseClient.mediaLibraryMediaItem.findUniqueOrThrow({
          where: { id: surroundingMediaItems.next.id },
          select: {
            id: true,
            title: true,
            synopsis: true,
            durationInSec: true,
            seasonNumber: true,
            episodeNumber: true,
          },
        }),
        watchProgressInSec: watchProgressItem.durationInSec,
      };
    }

    return null;
  }

  async findLibraryIds(): Promise<bigint[]> {
    return (await this.databaseClient.mediaLibrary.findMany({
      where: this.FILTER_LIBRARY_FOR_USER,
      select: {
        id: true,
      },
    }))
      .map(library => library.id);
  }

  private async mapLibraryPathUrisToUserFile(uris: string[]): Promise<LocalFile[]> {
    const files: VirtualFile[] = [];

    for (const uri of uris) {
      files.push(await this.fileProvider.provideForUserByUri(this.user, ApolloFileURI.parse(uri)));
    }

    return files as LocalFile[];
  }
}
