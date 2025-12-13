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

  async findOwnedByUser(apolloUser: ApolloUser): Promise<MediaLibrary[]> {
    const fetchedLibraries = await this.databaseClient.mediaLibrary.findMany({
      where: {
        ownerId: apolloUser.id,
      },

      select: {
        id: true,
        ownerId: true,
        name: true,
        directoryUris: true,
      },
    });

    return fetchedLibraries.map((data) => MediaLibrary.fromData(data));
  }
}
