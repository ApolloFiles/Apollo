import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import FullLibrary from './FullLibrary.js';
import ReadContentsLibrary from './ReadContentsLibrary.js';

@singleton()
export default class MediaLibraryFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findById(id: bigint): Promise<ReadContentsLibrary | null> {
    const libraryData = await this.databaseClient.mediaLibrary.findUnique({
      where: { id },

      select: {
        id: true,
        ownerId: true,
        name: true,
      },
    });

    if (libraryData == null) {
      return null;
    }
    return ReadContentsLibrary.fromData(libraryData);
  }

  async findFullById(id: bigint): Promise<FullLibrary | null> {
    const libraryData = await this.databaseClient.mediaLibrary.findUnique({
      where: { id },

      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
        MediaLibrarySharedWith: {
          select: {
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (libraryData == null) {
      return null;
    }
    return FullLibrary.fromData(libraryData);
  }
}
