import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../database/prisma-client/client.js';
import type {
  MediaLibraryMediaExternalIdSource,
  MediaLibraryMediaStreamType,
} from '../../../../../database/prisma-client/enums.js';
import type { PrismaPromise } from '../../../../../database/prisma-client/internal/prismaNamespace.js';

type PendingMediaItem = {
  mediaId: bigint,
  relativeFilePath: string,
  title: string,
  durationInSec: number,
  synopsis: string | null,
  seasonNumber: number | null,
  episodeNumber: number | null,
  streams: {
    index: number,
    type: MediaLibraryMediaStreamType,
    normalizedLanguage: string,
    flagDefault: boolean,
    flagCommentary: boolean,
    forHearingImpaired: boolean,
    treatAsForced: boolean,
  }[],
}

export default class MediaLibraryMediaWriter {
  private static readonly MISSING_ITEM_GRACE_PERIOD_IN_MS = 14 * 24 * 60 * 60 * 1000;

  private readonly scanStartPromise: Promise<Date>;
  private readonly pendingMediaItems: PendingMediaItem[] = [];
  private readonly itemsKeptDespiteFailure: { mediaId: bigint, relativeFilePath: string }[] = [];
  private readonly directoryUrisExcludedFromCleanup: string[] = [];

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
    streams: PendingMediaItem['streams'],
  ): Promise<void> {
    this.pendingMediaItems.push({
      mediaId,
      relativeFilePath,
      title,
      durationInSec,
      synopsis,
      seasonNumber,
      episodeNumber,
      streams,
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
      const key = this.determineKey(item.mediaId, item.relativeFilePath);
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

    await this.databaseClient.$transaction(async (transaction) => {
      await transaction.mediaLibraryMediaItem.createMany({
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
      });

      for (const [mediaId, paths] of pathsByMediaId) {
        await transaction.mediaLibraryMediaItem.updateMany({
          where: { mediaId, relativeFilePath: { in: paths } },
          data: { lastScannedAt: scanStart, missingSince: null },
        });
      }

      const persistedItems = await transaction.mediaLibraryMediaItem.findMany({
        where: {
          OR: Array.from(pathsByMediaId, ([mediaId, paths]) => ({ mediaId, relativeFilePath: { in: paths } })),
        },
        select: { id: true, mediaId: true, relativeFilePath: true, durationInSec: true },
      });
      const idByKey = new Map(persistedItems.map(i => [this.determineKey(i.mediaId, i.relativeFilePath), i.id]));
      const durationByKey = new Map(persistedItems.map(i => [this.determineKey(i.mediaId, i.relativeFilePath), i.durationInSec]));

      await this.updateChangedDurations(transaction, items, idByKey, durationByKey);

      const streamRows = items.flatMap(item => {
        const mediaItemId = idByKey.get(this.determineKey(item.mediaId, item.relativeFilePath));
        if (mediaItemId == null) {
          return [];
        }
        return item.streams.map(stream => ({
          mediaItemId,
          index: stream.index,
          type: stream.type,
          language: stream.normalizedLanguage,
          flagDefault: stream.flagDefault,
          flagCommentary: stream.flagCommentary,
          forHearingImpaired: stream.forHearingImpaired,
          treatAsForced: stream.treatAsForced,
        }));
      });

      await transaction.mediaLibraryMediaItemStreams.deleteMany({
        where: { mediaItemId: { in: Array.from(idByKey.values()) } },
      });
      if (streamRows.length > 0) {
        await transaction.mediaLibraryMediaItemStreams.createMany({ data: streamRows });
      }
    });
  }

  /**
   * The createMany above skips rows that already exist, so their duration would stay whatever the very
   * first scan wrote – stale after the file was remuxed, or simply wrong for everything scanned before
   * the duration was derived from the streams instead of the container.
   *
   * A single `updateMany` cannot do this: every item needs its *own* duration. Rescans barely change
   * anything though, so only the items whose duration actually differs are written, grouped by their
   * new value.
   */
  private async updateChangedDurations(
    transaction: Prisma.TransactionClient,
    items: PendingMediaItem[],
    idByKey: Map<string, bigint>,
    durationByKey: Map<string, number>,
  ): Promise<void> {
    const itemIdsByDuration = new Map<number, bigint[]>();

    for (const item of items) {
      const key = this.determineKey(item.mediaId, item.relativeFilePath);
      const itemId = idByKey.get(key);
      if (itemId == null || durationByKey.get(key) === item.durationInSec) {
        continue;
      }

      let itemIds = itemIdsByDuration.get(item.durationInSec);
      if (itemIds == null) {
        itemIds = [];
        itemIdsByDuration.set(item.durationInSec, itemIds);
      }
      itemIds.push(itemId);
    }

    for (const [durationInSec, itemIds] of itemIdsByDuration) {
      await transaction.mediaLibraryMediaItem.updateMany({
        where: { id: { in: itemIds } },
        data: { durationInSec },
      });
    }
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

  /** For a file that exists but could not be scanned: its existing item is left as it is by {@link markMissingAndDeleteExpiredMediaItems} */
  keepExistingMediaItem(mediaId: bigint, relativeFilePath: string): void {
    this.itemsKeptDespiteFailure.push({ mediaId, relativeFilePath });
  }

  /** For a directory that could not be scanned: the media in or below it are left as they are by {@link markMissingAndDeleteExpiredMediaItems} */
  excludeFromCleanup(directoryUri: string): void {
    this.directoryUrisExcludedFromCleanup.push(directoryUri);
  }

  /**
   * Items not found by this scan are hidden instead of deleted, so a file that comes back keeps its item and watch progress.
   * Only those still missing after the grace period are deleted, followed by media left without any items.
   */
  async markMissingAndDeleteExpiredMediaItems(libraryId: bigint): Promise<void> {
    const scanStart = await this.scanStartPromise;
    const expiredBefore = new Date(scanStart.getTime() - MediaLibraryMediaWriter.MISSING_ITEM_GRACE_PERIOD_IN_MS);

    const mediaToKeep: Prisma.MediaLibraryMediaWhereInput = {
      NOT: {
        OR: this.directoryUrisExcludedFromCleanup.flatMap((directoryUri) => [
          { directoryUri },
          { directoryUri: { startsWith: `${directoryUri}/` } },
        ]),
      },
    };
    const itemsInCleanup: Prisma.MediaLibraryMediaItemWhereInput = {
      media: { libraryId, ...mediaToKeep },
      NOT: { OR: this.itemsKeptDespiteFailure },
    };

    await this.databaseClient.$transaction([
      this.databaseClient.mediaLibraryMediaItem.updateMany({
        where: { ...itemsInCleanup, lastScannedAt: { lt: scanStart }, missingSince: null },
        data: { missingSince: scanStart },
      }),

      this.databaseClient.mediaLibraryMediaItem.deleteMany({
        where: { ...itemsInCleanup, missingSince: { lt: expiredBefore } },
      }),

      this.databaseClient.mediaLibraryMedia.deleteMany({
        where: { libraryId, items: { none: {} }, ...mediaToKeep },
      }),
    ]);
  }

  private determineKey(mediaId: bigint, relativeFilePath: string): string {
    return `${mediaId}|${relativeFilePath}`;
  }
}
