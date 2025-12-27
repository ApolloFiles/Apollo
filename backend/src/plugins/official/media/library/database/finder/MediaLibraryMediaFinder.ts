import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaSelect } from '../../../../../../database/prisma-client/models/MediaLibraryMedia.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import MediaLibraryMedia from '../MediaLibraryMedia.js';

@singleton()
export default class MediaLibraryMediaFinder {
  private readonly MEDIA_SELECT = {
    id: true,
    title: true,
    synopsis: true,
    directoryUri: true,
    addedAt: true,
    externalApiFetchedAt: true,

    library: {
      select: {
        id: true,
        ownerId: true,
      },
    },
  } satisfies MediaLibraryMediaSelect;

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

      select: this.MEDIA_SELECT,
    });

    if (fetchedMedia == null) {
      return null;
    }
    return MediaLibraryMedia.fromData(fetchedMedia);
  }

  async findByLibraryId(libraryId: bigint): Promise<MediaLibraryMedia[]> {
    const fetchedMedia = await this.databaseClient.mediaLibraryMedia.findMany({
      where: { libraryId },
      select: this.MEDIA_SELECT,
    });

    return fetchedMedia.map(media => MediaLibraryMedia.fromData(media));
  }
}
