import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import ReadContentsLibraryMediaItem from '../media-item/ReadContentsLibraryMediaItem.js';

export type RecentWatchProgress = {
  watchedSec: number,
  item: ReadContentsLibraryMediaItem,
  mediaTitle: string,
  mediaYear: number | null,
};

const RECENT_SELECT = {
  durationInSec: true,
  mediaItem: {
    select: {
      id: true,
      title: true,
      synopsis: true,
      addedAt: true,
      durationInSec: true,
      episodeNumber: true,
      seasonNumber: true,

      media: {
        select: {
          id: true,
          title: true,
          year: true,
          library: {
            select: {
              id: true,
              ownerId: true,
            },
          },
        },
      },
    },
  },
} as const;

@singleton()
export default class WatchProgressFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  /** This user's own progress for a single item, or `null` when the item was never started. */
  async findProgressInSecForItem(userId: ApolloUser['id'], mediaItemId: bigint): Promise<number | null> {
    const watchProgress = await this.databaseClient.mediaLibraryUserWatchProgress.findUnique({
      where: {
        userId_mediaItemId: {
          userId,
          mediaItemId,
        },
      },
      select: { durationInSec: true },
    });

    return watchProgress?.durationInSec ?? null;
  }

  /** This user's most-recently-updated progress rows, scoped to the given (accessible) libraries. */
  async findRecentForUser(userId: ApolloUser['id'], libraryIds: bigint[], take = 100): Promise<RecentWatchProgress[]> {
    const rows = await this.databaseClient.mediaLibraryUserWatchProgress.findMany({
      where: {
        userId,
        mediaItem: {
          media: {
            libraryId: { in: libraryIds },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take,
      select: RECENT_SELECT,
    });

    return rows.map(row => WatchProgressFinder.toRecentWatchProgress(row));
  }

  /** This user's most-recently-updated progress row for a single media, or `null`. */
  async findMostRecentForMedia(userId: ApolloUser['id'], mediaId: bigint): Promise<RecentWatchProgress | null> {
    const row = await this.databaseClient.mediaLibraryUserWatchProgress.findFirst({
      where: {
        userId,
        mediaItem: {
          mediaId,
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: RECENT_SELECT,
    });

    return row != null ? WatchProgressFinder.toRecentWatchProgress(row) : null;
  }

  private static toRecentWatchProgress(row: {
    durationInSec: number,
    mediaItem: Parameters<typeof ReadContentsLibraryMediaItem.fromData>[0] & {
      media: { title: string, year: number | null },
    },
  }): RecentWatchProgress {
    return {
      watchedSec: row.durationInSec,
      item: ReadContentsLibraryMediaItem.fromData(row.mediaItem),
      mediaTitle: row.mediaItem.media.title,
      mediaYear: row.mediaItem.media.year,
    };
  }
}
