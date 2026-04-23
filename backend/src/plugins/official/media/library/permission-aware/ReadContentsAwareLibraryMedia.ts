import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type ReadContentsLibraryMedia from '../database/media/ReadContentsLibraryMedia.js';
import ReadContentsLibraryMediaItem from '../database/media-item/ReadContentsLibraryMediaItem.js';

export default class ReadContentsAwareLibraryMedia {
  constructor(
    public readonly media: ReadContentsLibraryMedia,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findItem(itemId: bigint): Promise<ReadContentsLibraryMediaItem | null> {
    const mediaData = await this.databaseClient.mediaLibraryMediaItem.findUnique({
      where: {
        id: itemId,
        mediaId: this.media.id,
      },
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

  // FIXME: remove if not needed yet
  async findAllItems(): Promise<ReadContentsLibraryMediaItem[]> {
    const allMediaData = await this.databaseClient.mediaLibraryMediaItem.findMany({
      where: { mediaId: this.media.id },
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
    return allMediaData.map(data => ReadContentsLibraryMediaItem.fromData(data));
  }
}
