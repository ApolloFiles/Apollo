import { singleton } from 'tsyringe';
import type ApolloUser from '../../../../user/ApolloUser.js';
import MediaLibraryByUserFinder from './database/library/MediaLibraryByUserFinder.js';
import MediaLibraryMediaFinder from './database/media/MediaLibraryMediaFinder.js';
import MediaLibraryMediaItemFinder from './database/media-item/MediaLibraryMediaItemFinder.js';
import type ReadContentsLibraryMediaItem from './database/media-item/ReadContentsLibraryMediaItem.js';
import WatchProgressFinder, { type RecentWatchProgress } from './database/watch-progress/WatchProgressFinder.js';

/** An episode is treated as finished when this many (or fewer) seconds remain. */
const FULLY_WATCHED_THRESHOLD_IN_SEC = 120;

export type ResolvedWatchItem = {
  mediaId: bigint,
  libraryId: bigint,
  mediaTitle: string,
  mediaYear: number | null,
  item: ReadContentsLibraryMediaItem,
  watchProgressInSec: number,
};

@singleton()
export default class ContinueWatchingProvider {
  constructor(
    private readonly watchProgressFinder: WatchProgressFinder,
    private readonly mediaLibraryMediaItemFinder: MediaLibraryMediaItemFinder,
    private readonly mediaLibraryByUserFinder: MediaLibraryByUserFinder,
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
  ) {
  }

  /**
   * The "continue watching" list for the given user.
   *
   * When `libraryId` is provided the caller is expected to have already permission-gated it; when it is
   * `null` the list spans every library the user can access.
   */
  async listForOverview(user: ApolloUser, libraryId: bigint | null, limit = 12): Promise<ResolvedWatchItem[]> {
    const libraryIds = libraryId != null
      ? [libraryId]
      : await this.mediaLibraryByUserFinder.findAccessibleLibraryIds(user.id);

    const recents = await this.watchProgressFinder.findRecentForUser(user.id, libraryIds);

    const result: ResolvedWatchItem[] = [];
    const seenMediaIds = new Set<bigint>();
    for (const recent of recents) {
      if (result.length >= limit) {
        break;
      }
      if (seenMediaIds.has(recent.item.mediaId)) {
        continue;
      }
      seenMediaIds.add(recent.item.mediaId);

      const resolved = await this.resolvePlayable(user.id, recent);
      if (resolved != null) {
        result.push(resolved);
      }
    }

    return result;
  }

  /**
   * The single item the user should play next for a media: their in-progress episode, the next episode
   * when the most-recent one is finished, or the first episode when nothing was watched yet.
   */
  async resolveNextForMedia(user: ApolloUser, mediaId: bigint): Promise<ResolvedWatchItem | null> {
    const recent = await this.watchProgressFinder.findMostRecentForMedia(user.id, mediaId);
    if (recent != null) {
      return this.resolvePlayable(user.id, recent);
    }

    const orderedItems = await this.mediaLibraryMediaItemFinder.findByMediaIdOrderedByEpisodeNumber(mediaId);
    const firstItem = orderedItems[0];
    if (firstItem == null) {
      return null;
    }

    const media = await this.mediaLibraryMediaFinder.findById(mediaId);
    return {
      mediaId: firstItem.mediaId,
      libraryId: firstItem.libraryId,
      mediaTitle: media?.title ?? '',
      mediaYear: media?.year ?? null,
      item: firstItem,
      watchProgressInSec: 0,
    };
  }

  private async resolvePlayable(userId: ApolloUser['id'], recent: RecentWatchProgress): Promise<ResolvedWatchItem | null> {
    const isWatchedFully = recent.item.durationInSec - recent.watchedSec <= FULLY_WATCHED_THRESHOLD_IN_SEC;
    if (!isWatchedFully) {
      return this.toResolvedWatchItem(recent.item, recent.watchedSec, recent);
    }

    const nextItem = await this.mediaLibraryMediaItemFinder.findNextInMedia(recent.item.mediaId, recent.item.id);
    if (nextItem == null) {
      return null;
    }

    // Use the NEXT episode's own progress (0 when unstarted) rather than carrying the finished episode's.
    const nextWatchProgressInSec = (await this.watchProgressFinder.findProgressInSecForItem(userId, nextItem.id)) ?? 0;
    return this.toResolvedWatchItem(nextItem, nextWatchProgressInSec, recent);
  }

  private toResolvedWatchItem(item: ReadContentsLibraryMediaItem, watchProgressInSec: number, recent: RecentWatchProgress): ResolvedWatchItem {
    return {
      mediaId: item.mediaId,
      libraryId: item.libraryId,
      mediaTitle: recent.mediaTitle,
      mediaYear: recent.mediaYear,
      item,
      watchProgressInSec,
    };
  }
}
