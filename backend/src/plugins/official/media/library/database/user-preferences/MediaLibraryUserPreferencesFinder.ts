import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import MediaLibraryUserPreferences from './MediaLibraryUserPreferences.js';

@singleton()
export default class MediaLibraryUserPreferencesFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findByLibraryAndUser(libraryId: bigint, userId: ApolloUser['id']): Promise<MediaLibraryUserPreferences> {
    const userPreferences = await this.databaseClient.mediaLibraryUserPreferences.findMany({
      where: {
        libraryId: libraryId,
        userId: userId,
      },

      select: {
        preferenceId: true,
        value: true,
      },
    });

    return MediaLibraryUserPreferences.fromData(userPreferences);
  }
}
