import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import MediaLibraryMedia from '../MediaLibraryMedia.js';

@singleton()
export default class MediaLibraryMediaFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findForUserById(apolloUser: ApolloUser, mediaId: bigint): Promise<MediaLibraryMedia | null> {
    const fetchedMedia = await this.databaseClient.mediaLibraryMedia.findUnique({
      where: {
        id: mediaId,
        library: {
          OR: [
            { ownerId: apolloUser.id },
            { MediaLibrarySharedWith: { some: { userId: apolloUser.id } } },
          ],
        },
      },

      select: {
        id: true,
        title: true,
        synopsis: true,
        directoryUri: true,
        addedAt: true,

        library: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (fetchedMedia == null) {
      return null;
    }
    return MediaLibraryMedia.fromData(fetchedMedia);
  }
}
