import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import MediaLibrary from './MediaLibrary.js';

@singleton()
export default class MediaLibraryFinder {
  private static readonly DEFAULT_SELECT_OPTIONS = {
    select: {
      id: true,
      ownerId: true,
      name: true,
      directoryUris: true,
      MediaLibrarySharedWith: {
        select: { userId: true },
      },
    },
    orderBy: { name: 'asc' },
  } satisfies Prisma.MediaLibraryFindManyArgs;

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async find(libraryId: bigint): Promise<MediaLibrary | null> {
    const mediaLibraryData = await this.databaseClient.mediaLibrary.findUnique({
      where: { id: libraryId },
      select: MediaLibraryFinder.DEFAULT_SELECT_OPTIONS.select,
    });

    if (mediaLibraryData == null) {
      return null;
    }
    return MediaLibrary.create(mediaLibraryData);
  }

  findOwnedBy(userId: string): Promise<MediaLibrary[]> {
    return this.executeFindMany({ ownerId: userId });
  }

  findSharedWith(userId: string): Promise<MediaLibrary[]> {
    return this.executeFindMany({
      MediaLibrarySharedWith: {
        some: { userId },
      },
    });
  }

  private async executeFindMany(where: Prisma.MediaLibraryFindManyArgs['where']): Promise<MediaLibrary[]> {
    const mediaLibrariesData = await this.databaseClient.mediaLibrary.findMany({
      where,
      ...MediaLibraryFinder.DEFAULT_SELECT_OPTIONS,
    });

    return mediaLibrariesData.map(data => MediaLibrary.create(data));
  }
}
