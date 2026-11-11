import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../database/prisma-client/client.js';
import type {
  MediaLibraryMediaExternalIdSource,
  MediaLibraryMediaStreamType,
} from '../../../../../database/prisma-client/enums.js';
import type { PrismaPromise } from '../../../../../database/prisma-client/internal/prismaNamespace.js';
import RenamedItemMatcher from './RenamedItemMatcher.js';

type PendingMediaItem = {
  mediaId: bigint,
  relativeFilePath: string,
  title: string,
  durationInSec: number,
  fileSizeInBytes: bigint,
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

type ItemKey = { mediaId: bigint, relativeFilePath: string };
type MissingItemRow = ItemKey & {
  id: bigint,
  seasonNumber: number | null,
  episodeNumber: number | null,
  fileSizeInBytes: bigint | null,
};
type CopyRow = { id: bigint, mediaId: bigint };
type RenameMatches = {
  matches: Map<PendingMediaItem, MissingItemRow>,
  copyRows: Map<PendingMediaItem, CopyRow>,
  mediaIdsWithOnlyCopies: Set<bigint>,
};
type AdoptionCandidate = { oldMediaIds: Set<bigint>, matchedCount: number };

const METADATA_FIELDS = ['title', 'synopsis', 'seasonNumber', 'episodeNumber', 'durationInSec', 'fileSizeInBytes'] as const;
const PERSISTED_ITEM_SELECT = {
  id: true,
  mediaId: true,
  relativeFilePath: true,
  title: true,
  synopsis: true,
  seasonNumber: true,
  episodeNumber: true,
  durationInSec: true,
  fileSizeInBytes: true,
} satisfies Prisma.MediaLibraryMediaItemSelect;
type PersistedItemRow = Prisma.MediaLibraryMediaItemGetPayload<{ select: typeof PERSISTED_ITEM_SELECT }>;

export default class MediaLibraryMediaWriter {
  private static readonly MISSING_ITEM_GRACE_PERIOD_IN_MS = 14 * 24 * 60 * 60 * 1000;
  private static readonly FLUSH_TRANSACTION_TIMEOUT_IN_MS = 60 * 1000;

  private readonly scanStartPromise: Promise<Date>;
  private readonly pendingMediaItems: PendingMediaItem[] = [];
  private readonly mediaIdsCreatedByThisScan = new Set<bigint>();
  private readonly itemsKeptDespiteFailure: ItemKey[] = [];
  private readonly directoryUrisExcludedFromCleanup: string[] = [];

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly libraryId: bigint,
  ) {
    this.scanStartPromise = this.databaseClient.fetchNow();
  }

  async createIfNotExists(libraryId: bigint, directoryUri: string, title: string): Promise<bigint> {
    const existing = await this.databaseClient.mediaLibraryMedia.findUnique({
      where: { libraryId_directoryUri: { libraryId, directoryUri } },
      select: { id: true },
    });
    if (existing != null) {
      return existing.id;
    }

    const created = await this.databaseClient.mediaLibraryMedia.create({
      data: { libraryId, directoryUri, title },
      select: { id: true },
    });
    this.mediaIdsCreatedByThisScan.add(created.id);
    return created.id;
  }

  /** Queues a media item for {@link flushPendingMediaItems}, which creates it, updates its metadata or moves a renamed item onto it */
  async createMediaItemIfNotExist(
    mediaId: bigint,
    relativeFilePath: string,
    title: string,
    durationInSec: number,
    fileSizeInBytes: bigint,
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
      fileSizeInBytes,
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
    const items = this.deduplicate(this.pendingMediaItems.splice(0));

    const persistedItems = await this.databaseClient.$transaction(async (transaction) => {
      let renameMatches = await this.findRenameMatches(transaction, items);
      if (await this.adoptRenamedMedia(transaction, items, renameMatches)) {
        renameMatches = await this.findRenameMatches(transaction, items);
      }
      await this.moveRenamedItems(transaction, renameMatches);

      await transaction.mediaLibraryMediaItem.createMany({
        data: items.map(i => ({
          mediaId: i.mediaId,
          relativeFilePath: i.relativeFilePath,
          lastScannedAt: scanStart,
          ...this.metadataOf(i),
        })),
        skipDuplicates: true,
      });

      await transaction.mediaLibraryMediaItem.updateMany({
        where: this.whereAnyOf(items),
        data: { lastScannedAt: scanStart, missingSince: null },
      });

      const persisted = await transaction.mediaLibraryMediaItem.findMany({
        where: this.whereAnyOf(items),
        select: PERSISTED_ITEM_SELECT,
      });
      await this.replaceStreams(transaction, items, new Map(persisted.map(i => [this.determineKey(i), i.id])));
      return persisted;
    }, { timeout: MediaLibraryMediaWriter.FLUSH_TRANSACTION_TIMEOUT_IN_MS });

    await this.updateChangedMetadata(items, new Map(persistedItems.map(i => [this.determineKey(i), i])));
  }

  private deduplicate(items: PendingMediaItem[]): PendingMediaItem[] {
    const itemsByKey = new Map<string, PendingMediaItem>();
    for (const item of items) {
      const key = this.determineKey(item);
      if (!itemsByKey.has(key)) {
        itemsByKey.set(key, item);
      }
    }
    return [...itemsByKey.values()];
  }

  /** @returns whether any media was adopted */
  private async adoptRenamedMedia(transaction: Prisma.TransactionClient, items: PendingMediaItem[], renameMatches: RenameMatches): Promise<boolean> {
    const adoptions = this.findAdoptions(renameMatches, items);
    for (const [newMediaId, oldMediaId] of adoptions) {
      await this.adoptMedia(transaction, newMediaId, oldMediaId);
      this.mediaIdsCreatedByThisScan.delete(newMediaId);
    }

    for (const item of [...items, ...this.itemsKeptDespiteFailure]) {
      item.mediaId = adoptions.get(item.mediaId) ?? item.mediaId;
    }
    return adoptions.size > 0;
  }

  /** A new media, at least half of whose files match items of one media this scan found nothing of, is that media renamed */
  private findAdoptions(renameMatches: RenameMatches, items: PendingMediaItem[]): Map<bigint, bigint> {
    const seenMediaIds = new Set([...items, ...this.itemsKeptDespiteFailure].map(item => item.mediaId));
    const itemCountByMediaId = new Map<bigint, number>();
    for (const item of items) {
      itemCountByMediaId.set(item.mediaId, (itemCountByMediaId.get(item.mediaId) ?? 0) + 1);
    }

    const adoptions = new Map<bigint, bigint>();
    for (const [newMediaId, candidate] of this.collectAdoptionCandidates(renameMatches)) {
      const [oldMediaId] = candidate.oldMediaIds;
      if (candidate.oldMediaIds.size === 1 && !seenMediaIds.has(oldMediaId) && candidate.matchedCount * 2 >= itemCountByMediaId.get(newMediaId)!) {
        adoptions.set(newMediaId, oldMediaId);
      }
    }

    const timesAdopted = new Map<bigint, number>();
    for (const oldMediaId of adoptions.values()) {
      timesAdopted.set(oldMediaId, (timesAdopted.get(oldMediaId) ?? 0) + 1);
    }
    return new Map([...adoptions].filter(([, oldMediaId]) => timesAdopted.get(oldMediaId) === 1));
  }

  private collectAdoptionCandidates({ matches, mediaIdsWithOnlyCopies }: RenameMatches): Map<bigint, AdoptionCandidate> {
    const candidates = new Map<bigint, AdoptionCandidate>();
    for (const [item, missingItem] of matches) {
      if (!this.mediaIdsCreatedByThisScan.has(item.mediaId) && !mediaIdsWithOnlyCopies.has(item.mediaId)) {
        continue;
      }

      const candidate = candidates.get(item.mediaId) ?? { oldMediaIds: new Set(), matchedCount: 0 };
      candidate.oldMediaIds.add(missingItem.mediaId);
      candidate.matchedCount++;
      candidates.set(item.mediaId, candidate);
    }
    return candidates;
  }

  private async adoptMedia(transaction: Prisma.TransactionClient, newMediaId: bigint, oldMediaId: bigint): Promise<void> {
    await transaction.mediaLibraryMediaExternalIds.deleteMany({ where: { mediaId: oldMediaId } });
    await transaction.mediaLibraryMediaExternalIds.updateMany({ where: { mediaId: newMediaId }, data: { mediaId: oldMediaId } });
    const renamed = await transaction.mediaLibraryMedia.delete({ where: { id: newMediaId }, select: { directoryUri: true, title: true } });
    await transaction.mediaLibraryMedia.update({
      where: { id: oldMediaId },
      data: { directoryUri: renamed.directoryUri, title: renamed.title, externalApiFetchedAt: null },
    });
  }

  private async moveRenamedItems(transaction: Prisma.TransactionClient, { matches, copyRows }: RenameMatches): Promise<void> {
    for (const [item, missingItem] of matches) {
      const copyRow = copyRows.get(item);
      if (copyRow != null) {
        await transaction.mediaLibraryMediaItem.delete({ where: { id: copyRow.id } });
      }

      await transaction.mediaLibraryMediaItem.update({
        where: { id: missingItem.id },
        data: { mediaId: item.mediaId, relativeFilePath: item.relativeFilePath },
      });
    }
  }

  /** Copies are files whose item nobody has watched; they are matched only after files without an item */
  private async findRenameMatches(transaction: Prisma.TransactionClient, items: PendingMediaItem[]): Promise<RenameMatches> {
    const missingItems = await this.findItemsNotSeenByThisScan(transaction, items);
    if (missingItems.length === 0) {
      return { matches: new Map(), copyRows: new Map(), mediaIdsWithOnlyCopies: new Set() };
    }

    const existingRows = await transaction.mediaLibraryMediaItem.findMany({
      where: this.whereAnyOf(items),
      select: { id: true, mediaId: true, relativeFilePath: true, _count: { select: { userWatchProgress: true } } },
    });
    const existingByKey = new Map(existingRows.map(row => [this.determineKey(row), row]));

    const itemsWithoutRow: PendingMediaItem[] = [];
    const copyRows = new Map<PendingMediaItem, CopyRow>();
    for (const item of items) {
      const row = existingByKey.get(this.determineKey(item));
      if (row == null) {
        itemsWithoutRow.push(item);
      } else if (row._count.userWatchProgress === 0) {
        copyRows.set(item, row);
      }
    }

    const matches = RenamedItemMatcher.match(itemsWithoutRow, missingItems);
    const matchedMissingItems = new Set(matches.values());
    const stillMissingItems = missingItems.filter(missingItem => !matchedMissingItems.has(missingItem));
    const copyMatches = RenamedItemMatcher.match([...copyRows.keys()], stillMissingItems);

    return {
      matches: new Map([...matches, ...copyMatches]),
      copyRows: new Map([...copyRows].filter(([item]) => copyMatches.has(item))),
      mediaIdsWithOnlyCopies: await this.findMediaIdsWithOnlyCopies(transaction, [...copyRows.values()]),
    };
  }

  private async findItemsNotSeenByThisScan(transaction: Prisma.TransactionClient, items: PendingMediaItem[]): Promise<MissingItemRow[]> {
    const seenKeys = new Set([...items, ...this.itemsKeptDespiteFailure].map(item => this.determineKey(item)));
    const rows = await transaction.mediaLibraryMediaItem.findMany({
      where: { media: { libraryId: this.libraryId, ...this.mediaNotExcludedFromCleanup() } },
      select: { id: true, mediaId: true, relativeFilePath: true, seasonNumber: true, episodeNumber: true, fileSizeInBytes: true },
    });
    return rows.filter(row => !seenKeys.has(this.determineKey(row)));
  }

  private async findMediaIdsWithOnlyCopies(transaction: Prisma.TransactionClient, copyRows: CopyRow[]): Promise<Set<bigint>> {
    const copyCountByMediaId = new Map<bigint, number>();
    for (const row of copyRows) {
      copyCountByMediaId.set(row.mediaId, (copyCountByMediaId.get(row.mediaId) ?? 0) + 1);
    }

    const itemCounts = await transaction.mediaLibraryMediaItem.groupBy({
      by: ['mediaId'],
      where: { mediaId: { in: [...copyCountByMediaId.keys()] } },
      _count: { _all: true },
    });
    return new Set(itemCounts.filter(row => row._count._all === copyCountByMediaId.get(row.mediaId)).map(row => row.mediaId));
  }

  private async updateChangedMetadata(items: PendingMediaItem[], persistedByKey: Map<string, PersistedItemRow>): Promise<void> {
    for (const item of items) {
      const persisted = persistedByKey.get(this.determineKey(item));
      if (persisted == null || METADATA_FIELDS.every(field => persisted[field] === item[field])) {
        continue;
      }

      await this.databaseClient.mediaLibraryMediaItem.update({ where: { id: persisted.id }, data: this.metadataOf(item) });
    }
  }

  private async replaceStreams(transaction: Prisma.TransactionClient, items: PendingMediaItem[], idByKey: Map<string, bigint>): Promise<void> {
    const streamRows = items.flatMap(item => {
      const mediaItemId = idByKey.get(this.determineKey(item));
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
  }

  private metadataOf(item: PendingMediaItem): Pick<PendingMediaItem, typeof METADATA_FIELDS[number]> {
    return {
      title: item.title,
      synopsis: item.synopsis,
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      durationInSec: item.durationInSec,
      fileSizeInBytes: item.fileSizeInBytes,
    };
  }

  private whereAnyOf(items: ItemKey[]): Prisma.MediaLibraryMediaItemWhereInput {
    const pathsByMediaId = new Map<bigint, string[]>();
    for (const item of items) {
      const paths = pathsByMediaId.get(item.mediaId) ?? [];
      paths.push(item.relativeFilePath);
      pathsByMediaId.set(item.mediaId, paths);
    }
    return { OR: Array.from(pathsByMediaId, ([mediaId, paths]) => ({ mediaId, relativeFilePath: { in: paths } })) };
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

  keepExistingMediaItem(mediaId: bigint, relativeFilePath: string): void {
    this.itemsKeptDespiteFailure.push({ mediaId, relativeFilePath });
  }

  excludeFromCleanup(directoryUri: string): void {
    this.directoryUrisExcludedFromCleanup.push(directoryUri);
  }

  async markMissingAndDeleteExpiredMediaItems(): Promise<void> {
    const scanStart = await this.scanStartPromise;
    const expiredBefore = new Date(scanStart.getTime() - MediaLibraryMediaWriter.MISSING_ITEM_GRACE_PERIOD_IN_MS);

    const itemsInCleanup: Prisma.MediaLibraryMediaItemWhereInput = {
      media: { libraryId: this.libraryId, ...this.mediaNotExcludedFromCleanup() },
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
        where: { libraryId: this.libraryId, items: { none: {} }, ...this.mediaNotExcludedFromCleanup() },
      }),
    ]);
  }

  private mediaNotExcludedFromCleanup(): Prisma.MediaLibraryMediaWhereInput {
    return {
      NOT: {
        OR: this.directoryUrisExcludedFromCleanup.flatMap((directoryUri) => [
          { directoryUri },
          { directoryUri: { startsWith: `${directoryUri}/` } },
        ]),
      },
    };
  }

  private determineKey(item: ItemKey): string {
    return `${item.mediaId}|${item.relativeFilePath}`;
  }
}
