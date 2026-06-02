import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaExternalIdSource } from '../../../../../database/prisma-client/enums.js';
import type { PrismaPromise } from '../../../../../database/prisma-client/internal/prismaNamespace.js';

type PendingMediaItem = {
  mediaId: bigint,
  relativeFilePath: string,
  title: string,
  durationInSec: number,
  synopsis: string | null,
  seasonNumber: number | null,
  episodeNumber: number | null,
}

export default class MediaLibraryMediaWriter {
  private readonly scanStartPromise: Promise<Date>;
  private readonly pendingMediaItems: PendingMediaItem[] = [];

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

  /**
   * Queues a media item for the upcoming bulk flush. The row is not written until {@link flushPendingMediaItems}.
   * Existing rows keep their title/synopsis/etc. and only get `lastScannedAt` refreshed (matches the previous upsert behavior).
   */
  async createMediaItemIfNotExist(
    mediaId: bigint,
    relativeFilePath: string,
    title: string,
    durationInSec: number,
    synopsis: string | null,
    seasonNumber: number | null,
    episodeNumber: number | null,
  ): Promise<void> {
    this.pendingMediaItems.push({
      mediaId,
      relativeFilePath,
      title,
      durationInSec,
      synopsis,
      seasonNumber,
      episodeNumber,
    });
  }

  async flushPendingMediaItems(): Promise<void> {
    if (this.pendingMediaItems.length === 0) {
      return;
    }

    const scanStart = await this.scanStartPromise;
    const buffered = this.pendingMediaItems.splice(0);

    const seen = new Set<string>();
    const items: PendingMediaItem[] = [];
    for (const item of buffered) {
      const key = `${item.mediaId}|${item.relativeFilePath}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push(item);
    }

    const pathsByMediaId = new Map<bigint, string[]>();
    for (const item of items) {
      let arr = pathsByMediaId.get(item.mediaId);
      if (arr == null) {
        arr = [];
        pathsByMediaId.set(item.mediaId, arr);
      }
      arr.push(item.relativeFilePath);
    }

    const operations: PrismaPromise<unknown>[] = [
      this.databaseClient.mediaLibraryMediaItem.createMany({
        data: items.map(i => ({
          mediaId: i.mediaId,
          relativeFilePath: i.relativeFilePath,
          lastScannedAt: scanStart,
          title: i.title,
          synopsis: i.synopsis,
          durationInSec: i.durationInSec,
          seasonNumber: i.seasonNumber,
          episodeNumber: i.episodeNumber,
        })),
        skipDuplicates: true,
      }),
    ];
    for (const [mediaId, paths] of pathsByMediaId) {
      operations.push(this.databaseClient.mediaLibraryMediaItem.updateMany({
        where: { mediaId, relativeFilePath: { in: paths } },
        data: { lastScannedAt: scanStart },
      }));
    }

    await this.databaseClient.$transaction(operations);
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
