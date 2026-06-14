import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import FullLibraryMedia from './FullLibraryMedia.js';
import ReadContentsLibraryMedia from './ReadContentsLibraryMedia.js';

export interface MediaLibraryMediaTitleSearchResult {
  id: bigint;
  title: string;
  year: number | null;
  libraryId: bigint;
  libraryName: string;
}

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
        year: true,
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
        year: true,
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

  async searchByTitle(libraryIds: bigint[], query: string, take = 50): Promise<MediaLibraryMediaTitleSearchResult[]> {
    if (libraryIds.length === 0) {
      return [];
    }

    const rows = await this.databaseClient.mediaLibraryMedia.findMany({
      where: {
        libraryId: { in: libraryIds },
        title: { contains: query, mode: 'insensitive' },
      },
      select: {
        id: true,
        title: true,
        year: true,
        library: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { title: 'asc' },
      take,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      year: row.year,
      libraryId: row.library.id,
      libraryName: row.library.name,
    }));
  }

  async findFullByLibraryId(libraryId: bigint): Promise<FullLibraryMedia[]> {
    const allMediaData = await this.databaseClient.mediaLibraryMedia.findMany({
      where: { libraryId },
      select: {
        id: true,
        title: true,
        synopsis: true,
        year: true,
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
