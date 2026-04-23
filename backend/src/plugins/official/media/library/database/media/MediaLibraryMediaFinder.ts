import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import FullLibraryMedia from './FullLibraryMedia.js';
import ReadContentsLibraryMedia from './ReadContentsLibraryMedia.js';

@singleton()
export default class MediaLibraryMediaFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findById(mediaId: bigint): Promise<ReadContentsLibraryMedia | null> {
    const mediaData = await this.databaseClient.mediaLibraryMedia.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        title: true,
        synopsis: true,
        addedAt: true,

        library: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (mediaData == null) {
      return null;
    }
    return ReadContentsLibraryMedia.fromData(mediaData);
  }

  async findFullById(mediaId: bigint): Promise<FullLibraryMedia | null> {
    const mediaData = await this.databaseClient.mediaLibraryMedia.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        title: true,
        synopsis: true,
        addedAt: true,

        externalApiFetchedAt: true,
        directoryUri: true,

        library: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    if (mediaData == null) {
      return null;
    }
    return FullLibraryMedia.fromData(mediaData);
  }

  async findFullByLibraryId(libraryId: bigint): Promise<FullLibraryMedia[]> {
    const allMediaData = await this.databaseClient.mediaLibraryMedia.findMany({
      where: { libraryId },
      select: {
        id: true,
        title: true,
        synopsis: true,
        addedAt: true,

        externalApiFetchedAt: true,
        directoryUri: true,

        library: {
          select: {
            id: true,
            ownerId: true,
          },
        },
      },
    });

    return allMediaData.map(data => FullLibraryMedia.fromData(data));
  }
}
