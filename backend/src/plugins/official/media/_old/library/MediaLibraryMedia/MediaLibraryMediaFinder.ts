import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import MediaLibraryMedia from './MediaLibraryMedia.js';

@singleton()
export default class MediaLibraryMediaFinder {
  private static readonly DEFAULT_SELECT_OPTIONS = {
    select: {
      id: true,
      libraryId: true,
      title: true,
      synopsis: true,
      library: {
        select: {
          ownerId: true,
          MediaLibrarySharedWith: {
            select: { userId: true },
          },
        },
      },
    },
    orderBy: { addedAt: 'desc' },
  }satisfies Prisma.MediaLibraryMediaFindManyArgs;

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async find(libraryMediaId: bigint): Promise<MediaLibraryMedia | null> {
    const mediaLibraryMediaData = await this.databaseClient.mediaLibraryMedia.findUnique({
      where: { id: libraryMediaId },
      select: MediaLibraryMediaFinder.DEFAULT_SELECT_OPTIONS.select,
    });

    if (mediaLibraryMediaData == null) {
      return null;
    }
    return MediaLibraryMedia.create(mediaLibraryMediaData);
  }

  findByLibraryId(libraryId: bigint): Promise<MediaLibraryMedia[]> {
    return this.executeFindMany({ libraryId });
  }

  findByLibraryIds(libraryIds: bigint[]): Promise<MediaLibraryMedia[]> {
    return this.executeFindMany({
      libraryId: {
        in: libraryIds,
      },
    });
  }

  private async executeFindMany(where: Prisma.MediaLibraryMediaFindManyArgs['where']): Promise<MediaLibraryMedia[]> {
    const mediaLibraryMediaData = await this.databaseClient.mediaLibraryMedia.findMany({
      where,
      ...MediaLibraryMediaFinder.DEFAULT_SELECT_OPTIONS,
    });

    return mediaLibraryMediaData.map(data => MediaLibraryMedia.create(data));
  }
}
