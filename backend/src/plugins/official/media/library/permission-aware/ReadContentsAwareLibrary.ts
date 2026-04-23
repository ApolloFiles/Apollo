import DatabaseClient from '../../../../../database/DatabaseClient.js';
import ResourceNotFoundError from '../../../../../permission/error/ResourceNotFoundError.js';
import type ReadContentsLibrary from '../database/library/ReadContentsLibrary.js';
import ReadContentsLibraryMedia from '../database/media/ReadContentsLibraryMedia.js';
import ReadContentsAwareLibraryMedia from './ReadContentsAwareLibraryMedia.js';

export default class ReadContentsAwareLibrary {
  constructor(
    public readonly library: ReadContentsLibrary,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  /**
   * @throws ResourceNotFoundError
   */
  async findMedia(mediaId: bigint): Promise<ReadContentsAwareLibraryMedia> {
    const mediaData = await this.databaseClient.mediaLibraryMedia.findUnique({
      where: { id: mediaId, libraryId: this.library.id },
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
      throw new ResourceNotFoundError();
    }

    return new ReadContentsAwareLibraryMedia(ReadContentsLibraryMedia.fromData(mediaData), this.databaseClient);
  }

  // FIXME: remove if not needed yet
  async findAllMedia(): Promise<ReadContentsAwareLibraryMedia[]> {
    const allMediaData = await this.databaseClient.mediaLibraryMedia.findMany({
      where: { libraryId: this.library.id },
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
    return allMediaData.map(data => new ReadContentsAwareLibraryMedia(ReadContentsLibraryMedia.fromData(data), this.databaseClient));
  }
}
