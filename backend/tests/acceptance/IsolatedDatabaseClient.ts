import DatabaseClient from '#src/database/DatabaseClient.js';
import { createIsolatedAcceptanceDatabase } from '#tests/acceptance/AcceptanceTestEnvironment.js';

/** A client for a database of its own – see {@link createIsolatedAcceptanceDatabase} */
export async function createIsolatedDatabaseClient(): Promise<{ databaseClient: DatabaseClient, dispose: () => Promise<void> }> {
  const database = await createIsolatedAcceptanceDatabase();

  const sharedDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = database.url;
  const databaseClient = new DatabaseClient();
  process.env.DATABASE_URL = sharedDatabaseUrl;

  return {
    databaseClient,
    dispose: async () => {
      await databaseClient.$disconnect();
      await database.drop();
    },
  };
}
