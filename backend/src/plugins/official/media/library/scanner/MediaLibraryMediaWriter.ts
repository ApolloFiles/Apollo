import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaExternalIdSource } from '../../../../../database/prisma-client/enums.js';
import type { PrismaPromise } from '../../../../../database/prisma-client/internal/prismaNamespace.js';

export default class MediaLibraryMediaWriter {
  private readonly scanStartPromise: Promise<Date>;

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
    this.scanStartPromise = this.databaseClient.fetchNow();
  }

  async createIfNotExists(libraryId: bigint, directoryUri: string, title: string): Promise<bigint> {
    const upsertResult = await this.databaseClient.mediaLibraryMedia.upsert({
      where: {
        libraryId_directoryUri: {
          libraryId,
          directoryUri,
        },
      },
      create: {
        libraryId,
        directoryUri,
        title,
      },
      update: {},
      select: {
        id: true,
      },
    });
    return upsertResult.id;
  }

  async createMediaItemIfNotExist(
    mediaId: bigint,
    relativeFilePath: string,
    title: string,
    durationInSec: number,
    synopsis: string | null,
    seasonNumber: number | null,
    episodeNumber: number | null,
  ): Promise<void> {
    await this.databaseClient.mediaLibraryMediaItem.upsert({
      where: {
        mediaId_relativeFilePath: {
          mediaId,
          relativeFilePath,
        },
      },
      create: {
        mediaId,
        relativeFilePath,
        lastScannedAt: await this.scanStartPromise,
        title,
        synopsis,
        durationInSec,
        seasonNumber,
        episodeNumber,
      },
      update: {
        lastScannedAt: await this.scanStartPromise,
      },
    });
  }

  async updateExternalIds(mediaId: bigint, externalIds: Partial<Record<MediaLibraryMediaExternalIdSource, string>>): Promise<void> {
    const sourcesToKeep = Object.keys(externalIds) as MediaLibraryMediaExternalIdSource[];

    const queriesToExecute: PrismaPromise<unknown>[] = [
      this.databaseClient.mediaLibraryMediaExternalIds.deleteMany({
        where: {
          mediaId,
          source: {
            notIn: sourcesToKeep,
          },
        },
      }),
    ];

    for (const [source, externalId] of Object.entries(externalIds)) {
      queriesToExecute.push(this.databaseClient.mediaLibraryMediaExternalIds.upsert({
        where: {
          mediaId_source: {
            mediaId,
            source: source as MediaLibraryMediaExternalIdSource,
          },
        },
        create: {
          mediaId,
          source: source as MediaLibraryMediaExternalIdSource,
          externalId,
        },
        update: {
          externalId,
        },
      }));
    }

    await this.databaseClient.$transaction(queriesToExecute);
  }

  async deleteOldMediaItems(libraryId: bigint): Promise<void> {
    await this.databaseClient.$transaction([
      this.databaseClient.mediaLibraryMediaItem.deleteMany({
        where: {
          media: {
            libraryId,
          },
          lastScannedAt: {
            lt: await this.scanStartPromise,
          },
        },
      }),

      this.databaseClient.mediaLibraryMedia.deleteMany({
        where: {
          libraryId,
          items: {
            none: {},
          },
        },
      }),
    ]);
  }
}
