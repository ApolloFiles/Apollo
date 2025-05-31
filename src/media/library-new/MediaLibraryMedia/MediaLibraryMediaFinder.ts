import type { Prisma, PrismaClient } from '@prisma/client';
import { injectable } from 'tsyringe';
import { getPrismaClient } from '../../../Constants';
import MediaLibraryMedia from './MediaLibraryMedia';

@injectable()
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

  async find(libraryMediaId: bigint): Promise<MediaLibraryMedia | null> {
    const mediaLibraryMediaData = await this.getDatabaseClient().mediaLibraryMedia.findUnique({
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
    const mediaLibraryMediaData = await this.getDatabaseClient().mediaLibraryMedia.findMany({
      where,
      ...MediaLibraryMediaFinder.DEFAULT_SELECT_OPTIONS,
    });

    return mediaLibraryMediaData.map(data => MediaLibraryMedia.create(data));
  }

  private getDatabaseClient(): PrismaClient {
    const databaseClient = getPrismaClient();
    if (databaseClient == null) {
      throw new Error('A database connection is required for this feature, but not configured');
    }
    return databaseClient;
  }
}
