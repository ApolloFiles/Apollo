import type { Prisma, PrismaClient } from '@prisma/client';
import { injectable } from 'tsyringe';
import { getPrismaClient } from '../../../Constants';
import MediaLibrary from './MediaLibrary';

@injectable()
export default class MediaLibraryFinder {
  private static readonly DEFAULT_SELECT_OPTIONS = {
    select: {
      id: true,
      ownerId: true,
      name: true,
      directoryPaths: true,
      MediaLibrarySharedWith: {
        select: { userId: true },
      },
    },
    orderBy: { name: 'asc' },
  }satisfies Prisma.MediaLibraryFindManyArgs;

  async find(libraryId: bigint): Promise<MediaLibrary | null> {
    const mediaLibraryData = await this.getDatabaseClient().mediaLibrary.findUnique({
      where: { id: libraryId },
      select: MediaLibraryFinder.DEFAULT_SELECT_OPTIONS.select,
    });

    if (mediaLibraryData == null) {
      return null;
    }
    return MediaLibrary.create(mediaLibraryData);
  }

  findOwnedBy(userId: bigint): Promise<MediaLibrary[]> {
    return this.executeFindMany({ ownerId: userId });
  }

  findSharedWith(userId: bigint): Promise<MediaLibrary[]> {
    return this.executeFindMany({
      MediaLibrarySharedWith: {
        some: { userId },
      },
    });
  }

  private async executeFindMany(where: Prisma.MediaLibraryFindManyArgs['where']): Promise<MediaLibrary[]> {
    const mediaLibrariesData = await this.getDatabaseClient().mediaLibrary.findMany({
      where,
      ...MediaLibraryFinder.DEFAULT_SELECT_OPTIONS,
    });

    return mediaLibrariesData.map(data => MediaLibrary.create(data));
  }

  private getDatabaseClient(): PrismaClient {
    const databaseClient = getPrismaClient();
    if (databaseClient == null) {
      throw new Error('A database connection is required for this feature, but not configured');
    }
    return databaseClient;
  }
}
