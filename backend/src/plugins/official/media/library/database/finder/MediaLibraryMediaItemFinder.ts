import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import MediaLibraryMediaItem from '../MediaLibraryMediaItem.js';

@singleton()
export default class MediaLibraryMediaItemFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findByMediaId(mediaId: bigint): Promise<MediaLibraryMediaItem[]> {
    const fetchedMediaItems = await this.databaseClient.mediaLibraryMediaItem.findMany({
      where: { mediaId },

      select: {
        id: true,
        relativeFilePath: true,
        title: true,
        synopsis: true,
        lastScannedAt: true,
        addedAt: true,
        externalApiFetchedAt: true,
        durationInSec: true,
        episodeNumber: true,
        seasonNumber: true,

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

    return fetchedMediaItems
      .map((mediaItem) => MediaLibraryMediaItem.fromData(mediaItem));
  }

  async findForUserById(apolloUser: ApolloUser, mediaItemId: bigint): Promise<MediaLibraryMediaItem | null> {
    const fetchedMediaItem = await this.databaseClient.mediaLibraryMediaItem.findUnique({
      where: {
        id: mediaItemId,
        media: {
          library: {
            OR: [
              { ownerId: apolloUser.id },
              { MediaLibrarySharedWith: { some: { userId: apolloUser.id } } },
            ],
          },
        },
      },

      select: {
        id: true,
        relativeFilePath: true,
        title: true,
        synopsis: true,
        lastScannedAt: true,
        addedAt: true,
        externalApiFetchedAt: true,
        durationInSec: true,
        episodeNumber: true,
        seasonNumber: true,

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

    if (fetchedMediaItem == null) {
      return null;
    }
    return MediaLibraryMediaItem.fromData(fetchedMediaItem);
  }
}
