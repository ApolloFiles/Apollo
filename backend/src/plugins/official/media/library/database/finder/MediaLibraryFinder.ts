import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import MediaLibrary from '../MediaLibrary.js';

@singleton()
export default class MediaLibraryFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findById(id: bigint): Promise<MediaLibrary | null> {
    const fetchedLibrary = await this.databaseClient.mediaLibrary.findUnique({
      where: { id },

      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
      },
    });

    if (fetchedLibrary == null) {
      return null;
    }
    return MediaLibrary.fromData(fetchedLibrary);
  }

  async findByIdForUser(id: bigint, apolloUser: ApolloUser): Promise<MediaLibrary | null> {
    const fetchedLibrary = await this.databaseClient.mediaLibrary.findFirst({
      where: {
        id,
        OR: [
          { ownerId: apolloUser.id },
          {
            MediaLibrarySharedWith: {
              some: {
                userId: apolloUser.id,
              },
            },
          },
        ],
      },

      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
      },
    });

    if (fetchedLibrary == null) {
      return null;
    }
    return MediaLibrary.fromData(fetchedLibrary);
  }

  async findOwnedByUser(apolloUser: ApolloUser): Promise<MediaLibrary[]> {
    const fetchedLibraries = await this.databaseClient.mediaLibrary.findMany({
      where: { ownerId: apolloUser.id },

      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
      },

      orderBy: { name: 'asc' },
    });

    return fetchedLibraries.map((data) => MediaLibrary.fromData(data));
  }

  async findSharedWithUser(apolloUser: ApolloUser): Promise<MediaLibrary[]> {
    const fetchedLibraries = await this.databaseClient.mediaLibrary.findMany({
      where: {
        MediaLibrarySharedWith: {
          some: {
            userId: apolloUser.id,
          },
        },
      },

      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
      },

      orderBy: { name: 'asc' },
    });

    return fetchedLibraries.map((data) => MediaLibrary.fromData(data));
  }
}
