import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import FullLibraryMediaItem from './FullLibraryMediaItem.js';
import ReadContentsLibraryMediaItem from './ReadContentsLibraryMediaItem.js';

@singleton()
export default class MediaLibraryMediaItemFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findById(itemId: bigint): Promise<ReadContentsLibraryMediaItem | null> {
    const mediaData = await this.databaseClient.mediaLibraryMediaItem.findUnique({
      where: { id: itemId },
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
            library: {
              select: {
                id: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });

    if (mediaData == null) {
      return null;
    }
    return ReadContentsLibraryMediaItem.fromData(mediaData);
  }

  // FIXME: delete method if not needed?
  async findFullById(itemId: bigint): Promise<FullLibraryMediaItem | null> {
    const mediaData = await this.databaseClient.mediaLibraryMediaItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        title: true,
        synopsis: true,
        addedAt: true,
        durationInSec: true,
        episodeNumber: true,
        seasonNumber: true,

        relativeFilePath: true,
        media: {
          select: {
            id: true,
            directoryUri: true,
            library: {
              select: {
                id: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });

    if (mediaData == null) {
      return null;
    }
    return FullLibraryMediaItem.fromData(mediaData);
  }

  async findByMediaIdOrderedByEpisodeNumber(mediaId: bigint): Promise<ReadContentsLibraryMediaItem[]> {
    const allMediaData = await this.databaseClient.mediaLibraryMediaItem.findMany({
      where: { mediaId },
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
            library: {
              select: {
                id: true,
                ownerId: true,
              },
            },
          },
        },
      },
      orderBy: [
        { seasonNumber: 'asc' },
        { episodeNumber: 'asc' },
      ],
    });

    return allMediaData.map(data => ReadContentsLibraryMediaItem.fromData(data));
  }

  async findNextInMedia(mediaId: bigint, afterItemId: bigint): Promise<ReadContentsLibraryMediaItem | null> {
    const orderedItems = await this.findByMediaIdOrderedByEpisodeNumber(mediaId);

    const currentIndex = orderedItems.findIndex(item => item.id === afterItemId);
    if (currentIndex === -1) {
      return null;
    }

    return orderedItems[currentIndex + 1] ?? null;
  }

  async findFullByMediaId(mediaId: bigint): Promise<FullLibraryMediaItem[]> {
    const allMediaData = await this.databaseClient.mediaLibraryMediaItem.findMany({
      where: { mediaId },
      select: {
        id: true,
        title: true,
        synopsis: true,
        addedAt: true,
        durationInSec: true,
        episodeNumber: true,
        seasonNumber: true,

        relativeFilePath: true,
        media: {
          select: {
            id: true,
            directoryUri: true,
            library: {
              select: {
                id: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });

    return allMediaData.map(data => FullLibraryMediaItem.fromData(data));
  }
}
