import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import FullLibrary from './FullLibrary.js';
import ReadContentsLibrary from './ReadContentsLibrary.js';

// TODO: move class to consumer
@singleton()
export default class MediaLibraryByUserFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findOwnedSortedByName(userId: ApolloUser['id']): Promise<ReadContentsLibrary[]> {
    const fetchedLibraries = await this.databaseClient.mediaLibrary.findMany({
      where: { ownerId: userId },

      select: {
        id: true,
        ownerId: true,
        name: true,
      },

      orderBy: { name: 'asc' },
    });

    return fetchedLibraries.map((data) => ReadContentsLibrary.fromData(data));
  }

  async findSharedSortedByName(userId: ApolloUser['id']): Promise<ReadContentsLibrary[]> {
    const fetchedLibraries = await this.databaseClient.mediaLibrary.findMany({
      where: {
        MediaLibrarySharedWith: {
          some: { userId: userId },
        },
      },

      select: {
        id: true,
        ownerId: true,
        name: true,
      },

      orderBy: { name: 'asc' },
    });

    return fetchedLibraries.map((data) => ReadContentsLibrary.fromData(data));
  }

  async gotLibraryShared(userId: ApolloUser['id'], libraryId: bigint): Promise<boolean> {
    const librarySharedWith = await this.databaseClient.mediaLibrarySharedWith.findUnique({
      where: {
        libraryId_userId: {
          userId,
          libraryId,
        },
      },
    });
    return librarySharedWith != null;
  }

  async findOwnedFull(userId: ApolloUser['id']): Promise<FullLibrary[]> {
    const fetchedLibraries = await this.databaseClient.mediaLibrary.findMany({
      where: { ownerId: userId },

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

      orderBy: { name: 'asc' },
    });

    return fetchedLibraries.map((data) => FullLibrary.fromData(data));
  }
}
