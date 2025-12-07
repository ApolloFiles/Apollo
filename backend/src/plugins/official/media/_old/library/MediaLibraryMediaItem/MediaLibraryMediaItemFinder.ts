import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import MediaLibraryMediaItem from './MediaLibraryMediaItem.js';

@singleton()
export default class MediaLibraryMediaItemFinder {
  private static readonly DEFAULT_SELECT_OPTIONS = {
    select: {
      id: true,
      mediaId: true,
      filePath: true,
      title: true,
      durationInSec: true,
      seasonNumber: true,
      episodeNumber: true,
      synopsis: true,
      media: {
        select: {
          id: true,
          library: {
            select: {
              id: true,
              ownerId: true,
              MediaLibrarySharedWith: {
                select: { userId: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
  } satisfies Prisma.MediaLibraryMediaItemFindManyArgs;

  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async find(libraryMediaId: bigint): Promise<MediaLibraryMediaItem | null> {
    const mediaLibraryMediaItemData = await this.databaseClient.mediaLibraryMediaItem.findUnique({
      where: { id: libraryMediaId },
      select: MediaLibraryMediaItemFinder.DEFAULT_SELECT_OPTIONS.select,
    });

    if (mediaLibraryMediaItemData == null) {
      return null;
    }
    return MediaLibraryMediaItem.create(mediaLibraryMediaItemData);
  }

  findByMediaId(mediaId: bigint): Promise<MediaLibraryMediaItem[]> {
    return this.executeFindMany({ mediaId });
  }

  async findSurroundingMediaItems(mediaItemId: bigint, mediaId: bigint): Promise<{
    previous: MediaLibraryMediaItem | null,
    next: MediaLibraryMediaItem | null
  }> {
    // TODO: Can we do something smart to only return up to 3 items instead of all?
    const allMediaItems = await this.executeFindMany({ mediaId });

    const mediaItemIndex = allMediaItems.findIndex(item => item.id === mediaItemId);
    if (mediaItemIndex === -1) {
      return { previous: null, next: null };
    }

    const previous = mediaItemIndex > 0 ? allMediaItems[mediaItemIndex - 1] : null;
    const next = mediaItemIndex < allMediaItems.length - 1 ? allMediaItems[mediaItemIndex + 1] : null;
    return { previous, next };
  }

  private async executeFindMany(where: Prisma.MediaLibraryMediaItemFindManyArgs['where']): Promise<MediaLibraryMediaItem[]> {
    const mediaLibraryMediaItemData = await this.databaseClient.mediaLibraryMediaItem.findMany({
      where,
      ...MediaLibraryMediaItemFinder.DEFAULT_SELECT_OPTIONS,
    });

    return mediaLibraryMediaItemData.map(data => MediaLibraryMediaItem.create(data));
  }
}
