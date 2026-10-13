import { AppCache } from '#src/cache/AppCache.js';
import { CacheCodecs } from '#src/cache/CacheCodec.js';
import type { CacheFileLocation } from '#src/cache/internal/CacheFileStorage.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import type { CacheIndexWrite } from '#src/cache/internal/database/CacheIndexWrite.js';
import { CacheExpireJob } from '#src/cache/maintenance/cron/CacheExpireJob.js';
import { UnknownCacheNamespaceFinder } from '#src/cache/maintenance/UnknownCacheNamespaceFinder.js';
import type DatabaseClient from '#src/database/DatabaseClient.js';
import {
  cacheFileExists,
  createCacheTestServices,
  findAllCacheKeys,
} from '#tests/acceptance/cache/CacheTestServices.js';
import { createIsolatedDatabaseClient } from '#tests/acceptance/IsolatedDatabaseClient.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import { TimeUnit } from '@spraxdev/node-commons/util';
import Path from 'node:path';

const DAY = 24 * 60 * 60 * 1000;

class AnimeXmlCache extends AppCache<string> {
  constructor(services: CacheServices, version: number) {
    super(services, { namespace: 'anidb.anime-xml', version, codec: CacheCodecs.text(), expiry: { freshMs: TimeUnit.DAYS.toMillis(1) } });
  }
}

describe(CacheExpireJob, () => {
  let databaseClient: DatabaseClient;
  let disposeDatabase: () => Promise<void>;
  let userId: string;
  let tmpDir: string;
  let services: CacheServices;
  let job: CacheExpireJob;

  beforeAll(async () => {
    // The job works across the whole database, so it gets one of its own
    ({ databaseClient, dispose: disposeDatabase } = await createIsolatedDatabaseClient());
    userId = (await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id;
  });

  afterAll(async () => {
    await disposeDatabase();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    ({ services } = createCacheTestServices(databaseClient, Path.join(tmpDir, 'cache')));
    job = new CacheExpireJob(databaseClient, services.cacheNamespaceRegistry, new UnknownCacheNamespaceFinder(databaseClient, services.cacheNamespaceRegistry), services.cacheEntryDeleter);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await databaseClient.cacheAppEntry.deleteMany();
    await databaseClient.cacheUserEntry.deleteMany();
  });

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * DAY);
  }

  /** Writes the entry the way the cache does: its file first, then its row */
  async function storeEntry(overrides: Partial<CacheIndexWrite>, entryUserId: string | null = null): Promise<CacheFileLocation> {
    const write: CacheIndexWrite = {
      namespace: 'anidb.anime-xml',
      version: 1,
      key: '17',
      groupKey: null,
      validator: null,
      payload: null,
      writtenAt: daysAgo(1),
      freshUntil: null,
      keepUntil: null,
      ...overrides,
    };
    const { fileId, tempPath } = await services.cacheFileStorage.allocateTemp();
    const location = { userId: entryUserId, namespace: write.namespace, version: write.version, fileId };
    await services.cacheFileStorage.writeTemp(tempPath, Buffer.from('<anime id="17"><title>Cowboy Bebop</title></anime>'));
    await services.cacheFileStorage.moveIntoPlace(tempPath, location);

    const index = entryUserId == null ? services.appCacheIndex : services.userCacheIndex.forUser(entryUserId);
    await index.upsertReturningPrevious({ ...write, payload: { fileId, sizeBytes: 51, contentType: 'application/xml' } });
    return location;
  }

  describe('expired entries', () => {
    beforeEach(() => {
      new AnimeXmlCache(services, 1);
    });

    test('Deletes an app entry past its keep-until date, together with its file', async () => {
      const location = await storeEntry({ key: '17', keepUntil: daysAgo(1) });

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual([]);
      await expect(cacheFileExists(services, location)).resolves.toBe(false);
    });

    test('Deletes a user entry past its keep-until date, together with its file', async () => {
      const location = await storeEntry({ key: '17', keepUntil: daysAgo(1) }, userId);

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual([]);
      await expect(cacheFileExists(services, location)).resolves.toBe(false);
    });

    test('Keeps a stale entry that is still before its keep-until date', async () => {
      const location = await storeEntry({ key: '17', freshUntil: daysAgo(1), keepUntil: new Date(Date.now() + DAY) });

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['17']);
      await expect(cacheFileExists(services, location)).resolves.toBe(true);
    });

    test('Keeps an entry that never expires', async () => {
      await storeEntry({ key: '17', keepUntil: null });

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['17']);
    });

    test('Deletes more expired entries than fit into one batch', async () => {
      await databaseClient.cacheAppEntry.createMany({
        data: Array.from({ length: 1001 }, (_, i) => ({
          namespace: 'anidb.anime-xml', version: 1, key: String(i), isNull: true, sizeBytes: 0, keepUntil: daysAgo(1),
        })),
      });

      await job.run();

      await expect(databaseClient.cacheAppEntry.count()).resolves.toBe(0);
    });
  });

  describe('unregistered versions', () => {
    test('Deletes the entries of an older version of a registered namespace, together with their files', async () => {
      new AnimeXmlCache(services, 2);
      const appLocation = await storeEntry({ key: '17', version: 1 });
      const userLocation = await storeEntry({ key: '18', version: 1 }, userId);

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual([]);
      await expect(cacheFileExists(services, appLocation)).resolves.toBe(false);
      await expect(cacheFileExists(services, userLocation)).resolves.toBe(false);
    });

    test('Keeps the entries of the current version', async () => {
      new AnimeXmlCache(services, 2);
      await storeEntry({ key: '17', version: 2 });
      await storeEntry({ key: '18', version: 2 }, userId);

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['17', '18']);
    });

    test('Keeps the entries of every registered version of a namespace', async () => {
      new AnimeXmlCache(services, 2);
      new AnimeXmlCache(services, 3);
      await storeEntry({ key: '17', version: 1 });
      await storeEntry({ key: '18', version: 2 });
      await storeEntry({ key: '19', version: 3 });

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['18', '19']);
    });
  });

  describe('unknown namespaces', () => {
    test('Deletes a namespace nothing in which was accessed for over 30 days, in both tables, together with its files', async () => {
      const appLocation = await storeEntry({ key: '17', writtenAt: daysAgo(31) });
      const userLocation = await storeEntry({ key: '18', writtenAt: daysAgo(32) }, userId);

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual([]);
      await expect(cacheFileExists(services, appLocation)).resolves.toBe(false);
      await expect(cacheFileExists(services, userLocation)).resolves.toBe(false);
    });

    test('Keeps a namespace accessed within the last 30 days', async () => {
      await storeEntry({ key: '17', writtenAt: daysAgo(29) });

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['17']);
    });

    test('Keeps all entries of a namespace while any of them was accessed within the last 30 days', async () => {
      await storeEntry({ key: '17', writtenAt: daysAgo(31) });
      await storeEntry({ key: '18', writtenAt: daysAgo(31) });
      await storeEntry({ key: '19', writtenAt: daysAgo(2) }, userId);

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['17', '18', '19']);
    });

    test('Keeps a registered namespace, however long ago it was accessed', async () => {
      new AnimeXmlCache(services, 1);
      await storeEntry({ key: '17', writtenAt: daysAgo(90) });

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['17']);
    });
  });
});
