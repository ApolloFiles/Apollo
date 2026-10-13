import { CacheNamespaceRegistry } from '#src/cache/internal/CacheNamespaceRegistry.js';
import { AppCacheIndex } from '#src/cache/internal/database/AppCacheIndex.js';
import type { CacheIndexWrite } from '#src/cache/internal/database/CacheIndexWrite.js';
import { UnknownCacheNamespaceFinder } from '#src/cache/maintenance/UnknownCacheNamespaceFinder.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import Crypto from 'node:crypto';

describe(UnknownCacheNamespaceFinder, () => {
  let databaseClient: DatabaseClient;
  let namespace: string;
  let appCacheIndex: AppCacheIndex;
  let unknownCacheNamespaceFinder: UnknownCacheNamespaceFinder;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(() => {
    // Test files share the database, so every test works in a namespace of its own
    namespace = `retired-plugin.metadata.${Crypto.randomUUID()}`;
    appCacheIndex = new AppCacheIndex(databaseClient);
    unknownCacheNamespaceFinder = new UnknownCacheNamespaceFinder(databaseClient, new CacheNamespaceRegistry());
  });

  afterEach(async () => {
    await databaseClient.cacheAppEntry.deleteMany({ where: { namespace } });
  });

  function createWrite(key: string, writtenAt: Date): CacheIndexWrite {
    return {
      namespace,
      version: 1,
      key,
      groupKey: null,
      validator: null,
      payload: { fileId: Crypto.randomUUID(), sizeBytes: 1_048_576, contentType: null },
      writtenAt,
      freshUntil: null,
      keepUntil: null,
    };
  }

  async function findOwnNamespace() {
    return (await unknownCacheNamespaceFinder.find()).find((unknown) => unknown.namespace === namespace);
  }

  test('Finds a namespace no registered cache uses, with its size and deletion date', async () => {
    await appCacheIndex.upsertReturningPrevious(createWrite('17', new Date('2026-09-01T08:00:00Z')));
    await appCacheIndex.upsertReturningPrevious(createWrite('18', new Date('2026-10-01T08:00:00Z')));

    await expect(findOwnNamespace()).resolves.toEqual({
      namespace,
      sizeBytes: 2_097_152,
      lastAccessedAt: new Date('2026-10-01T08:00:00Z'),
      deletableAfter: new Date('2026-10-31T08:00:00Z'),
    });
  });

  test('Scans the index only once', async () => {
    await unknownCacheNamespaceFinder.find();
    await appCacheIndex.upsertReturningPrevious(createWrite('17', new Date('2026-10-01T08:00:00Z')));

    await expect(findOwnNamespace()).resolves.toBeUndefined();
  });

  test('Scans again after a failed scan', async () => {
    vi.spyOn(databaseClient.cacheAppEntry, 'groupBy').mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));
    await unknownCacheNamespaceFinder.find().catch(() => undefined);
    await appCacheIndex.upsertReturningPrevious(createWrite('17', new Date('2026-10-01T08:00:00Z')));

    await expect(findOwnNamespace()).resolves.toMatchObject({ namespace });
  });
});
