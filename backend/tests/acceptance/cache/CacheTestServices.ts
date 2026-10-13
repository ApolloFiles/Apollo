import { CacheEntryDeleter } from '#src/cache/internal/CacheEntryDeleter.js';
import { type CacheFileLocation, CacheFileStorage } from '#src/cache/internal/CacheFileStorage.js';
import { CacheNamespaceRegistry } from '#src/cache/internal/CacheNamespaceRegistry.js';
import { CacheServices } from '#src/cache/internal/CacheServices.js';
import { AppCacheIndex } from '#src/cache/internal/database/AppCacheIndex.js';
import { UserCacheIndex } from '#src/cache/internal/database/UserCacheIndex.js';
import type { CacheMissCounter } from '#src/cache/internal/CacheMissCounter.js';
import type ApolloDirectoryProvider from '#src/config/ApolloDirectoryProvider.js';
import type DatabaseClient from '#src/database/DatabaseClient.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import type { DeepMockProxy } from 'vitest-mock-extended';

/** The real cache stack on top of the given database and cache root; only the miss counter is a mock */
export function createCacheTestServices(databaseClient: DatabaseClient, cacheRoot: string): {
  services: CacheServices,
  cacheMissCounter: DeepMockProxy<CacheMissCounter>,
} {
  const directoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
  directoryProvider.getCacheBaseDirectory.mockReturnValue(cacheRoot);
  const cacheFileStorage = new CacheFileStorage(directoryProvider);

  const cacheMissCounter = createStrictDeepMock<CacheMissCounter>();
  cacheMissCounter.record.mockReturnValue();

  const services = new CacheServices(
    databaseClient,
    new AppCacheIndex(databaseClient),
    new UserCacheIndex(databaseClient),
    cacheFileStorage,
    new CacheEntryDeleter(cacheFileStorage),
    cacheMissCounter,
    new CacheNamespaceRegistry(),
  );
  return { services, cacheMissCounter };
}

/** Whether the file of a cache entry is still on disk */
export async function cacheFileExists(services: CacheServices, location: CacheFileLocation): Promise<boolean> {
  const fileHandle = await services.cacheFileStorage.open(location).catch(() => null);
  await fileHandle?.close();
  return fileHandle != null;
}

/** The keys left in both index tables, sorted – for tests that work in a database of their own */
export async function findAllCacheKeys(databaseClient: DatabaseClient): Promise<string[]> {
  const appEntries = await databaseClient.cacheAppEntry.findMany({ select: { key: true } });
  const userEntries = await databaseClient.cacheUserEntry.findMany({ select: { key: true } });
  return [...appEntries, ...userEntries].map((entry) => entry.key).sort();
}
