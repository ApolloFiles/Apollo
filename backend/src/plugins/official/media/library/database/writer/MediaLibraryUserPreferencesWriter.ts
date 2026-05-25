import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type { Prisma } from '../../../../../../database/prisma-client/client.js';
import type ApolloUser from '../../../../../../user/ApolloUser.js';
import MediaLibraryUserPreferences from '../user-preferences/MediaLibraryUserPreferences.js';

@singleton()
export default class MediaLibraryUserPreferencesWriter {
  constructor(
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async update(userId: ApolloUser['id'], libraryId: bigint, preferences: MediaLibraryUserPreferences, transaction?: Prisma.TransactionClient): Promise<void> {
    const data = MediaLibraryUserPreferences.toData(preferences);

    const run = async (transaction: Prisma.TransactionClient) => {
      await Promise.all(data.map(({ preferenceId, value }) => transaction.mediaLibraryUserPreferences.upsert({
        where: {
          userId_libraryId_preferenceId: { userId, libraryId, preferenceId },
        },
        create: { userId, libraryId, preferenceId, value },
        update: { value },
      })));
    };

    if (transaction) {
      await run(transaction);
    } else {
      await this.databaseClient.$transaction((transaction) => run(transaction));
    }
  }
}
