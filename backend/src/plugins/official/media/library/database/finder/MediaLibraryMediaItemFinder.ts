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
        filePath: true,
        title: true,
        synopsis: true,
        lastScannedAt: true,
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

    if (fetchedMediaItem == null) {
      return null;
    }
    return MediaLibraryMediaItem.fromData(fetchedMediaItem);
  }
}
