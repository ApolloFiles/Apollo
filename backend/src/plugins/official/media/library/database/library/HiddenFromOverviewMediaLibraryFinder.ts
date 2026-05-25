import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import MediaLibraryUserPreferences from '../user-preferences/MediaLibraryUserPreferences.js';

@singleton()
export default class HiddenFromOverviewMediaLibraryFinder {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async findLibraryIds(userId: ApolloUser['id']): Promise<bigint[]> {
    const filter = MediaLibraryUserPreferences.getHideFromOverviewPreferenceData(true);

    const records = await this.databaseClient.mediaLibraryUserPreferences.findMany({
      where: {
        userId: userId,
        preferenceId: filter.preferenceId,
        value: filter.value,
      },

      select: {
        libraryId: true,
      },
    });

    return records.map((record) => record.libraryId);
  }
}
