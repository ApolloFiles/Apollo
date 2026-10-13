import { CacheCodecs } from '#src/cache/CacheCodec.js';
import type { CacheFactory } from '#src/cache/CacheFactory.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import { UserCache } from '#src/cache/UserCache.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import type { Mock } from 'vitest';

class ThumbnailCache extends UserCache<Buffer> {
  constructor(services: CacheServices, namespace: string) {
    super(services, { namespace, version: 1, codec: CacheCodecs.bytes(), expiry: 'never', contentType: 'image/avif' });
  }
}

const AVIF_BYTES = Buffer.from('avif bytes from ffmpeg');

describe(UserCache, () => {
  let databaseClient: DatabaseClient;
  let alice: ApolloUser;
  let bob: ApolloUser;
  let tmpDir: string;
  let cacheRoot: string;
  let namespace: string;
  let services: CacheServices;
  let cache: ThumbnailCache;

  beforeAll(async () => {
    databaseClient = new DatabaseClient();
    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    bob = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Bob' } })).id, 'Bob', false, false, null);
  });

  afterAll(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    cacheRoot = Path.join(tmpDir, 'cache');
    namespace = `media.thumbnail.${Crypto.randomUUID()}`;
    ({ services } = createCacheTestServices(databaseClient, cacheRoot));
    cache = new ThumbnailCache(services, namespace);
  });

  afterEach(async () => {
    await databaseClient.cacheUserEntry.deleteMany({ where: { namespace } });
  });

  async function listStoredFiles(user: ApolloUser): Promise<string[]> {
    const entries = await Fs.promises.readdir(Path.join(cacheRoot, 'user', user.id), { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  }

  test('Rejects an invalid definition when constructed', () => {
    expect(() => new ThumbnailCache(services, 'media@thumbnail')).toThrow('Invalid cache namespace \'media@thumbnail\'');
  });

  test('Returns a value it created earlier for the same user', async () => {
    await cache.forUser(alice).set('default:/movies/Arrival.mkv|avif', AVIF_BYTES);

    await using entry = await cache.forUser(alice).get('default:/movies/Arrival.mkv|avif');

    await expect(entry!.value()).resolves.toEqual(AVIF_BYTES);
  });

  test('Misses an entry another user stored under the same key', async () => {
    await cache.forUser(alice).set('default:/movies/Arrival.mkv|avif', AVIF_BYTES);

    await expect(cache.forUser(bob).get('default:/movies/Arrival.mkv|avif')).resolves.toBeUndefined();
  });

  test('Calls the factory once for concurrent requests of one user, even through separate bound caches', async () => {
    const factory: Mock<CacheFactory<Buffer>> = vi.fn(async () => AVIF_BYTES);

    const entries = await Promise.all([
      cache.forUser(alice).getOrCreate('default:/movies/Arrival.mkv|avif', factory),
      cache.forUser(alice).getOrCreate('default:/movies/Arrival.mkv|avif', factory),
    ]);
    await Promise.all(entries.map((entry) => entry[Symbol.asyncDispose]()));

    expect(factory).toHaveBeenCalledOnce();
  });

  test('Calls the factory once per user for concurrent requests of different users', async () => {
    const factory: Mock<CacheFactory<Buffer>> = vi.fn(async () => AVIF_BYTES);

    const entries = await Promise.all([
      cache.forUser(alice).getOrCreate('default:/movies/Arrival.mkv|avif', factory),
      cache.forUser(bob).getOrCreate('default:/movies/Arrival.mkv|avif', factory),
    ]);
    await Promise.all(entries.map((entry) => entry[Symbol.asyncDispose]()));

    expect(factory).toHaveBeenCalledTimes(2);
  });

  test('Uses the definition\'s content type', async () => {
    await cache.forUser(alice).set('default:/movies/Arrival.mkv|avif', AVIF_BYTES);

    await using entry = await cache.forUser(alice).get('default:/movies/Arrival.mkv|avif');

    expect(entry).toMatchObject({ contentType: 'image/avif' });
  });

  describe('groups', () => {
    beforeEach(async () => {
      await cache.forUser(alice).set('default:/movies/Arrival.mkv|avif', AVIF_BYTES, { groupKey: 'default:/movies/Arrival.mkv' });
      await cache.forUser(alice).set('default:/series/Severance/S01E01.mkv|avif', AVIF_BYTES, { groupKey: 'default:/series/Severance/S01E01.mkv' });
      await cache.forUser(bob).set('default:/movies/Arrival.mkv|avif', AVIF_BYTES, { groupKey: 'default:/movies/Arrival.mkv' });
    });

    test('Deleting a group removes its entries', async () => {
      await cache.forUser(alice).deleteGroup('default:/movies/Arrival.mkv');

      await expect(cache.forUser(alice).get('default:/movies/Arrival.mkv|avif')).resolves.toBeUndefined();
    });

    test('Deleting a group removes the files of its entries', async () => {
      await cache.forUser(alice).deleteGroup('default:/movies/Arrival.mkv');

      await expect(listStoredFiles(alice)).resolves.toHaveLength(1);
    });

    test('Deleting a group keeps the same group of another user', async () => {
      await cache.forUser(alice).deleteGroup('default:/movies/Arrival.mkv');

      await expect(listStoredFiles(bob)).resolves.toHaveLength(1);
    });

    test('Deleting a group prefix removes every entry below it, with its file', async () => {
      await cache.forUser(alice).deleteGroupPrefix('default:/series/');

      await expect(cache.forUser(alice).get('default:/series/Severance/S01E01.mkv|avif')).resolves.toBeUndefined();
      await expect(listStoredFiles(alice)).resolves.toHaveLength(1);
    });

    test('Deleting a group resolves and warns when it fails', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      vi.spyOn(services.cacheEntryDeleter, 'deleteFilesOf').mockRejectedValue(new Error('EIO: i/o error'));

      await cache.forUser(alice).deleteGroup('default:/movies/Arrival.mkv');

      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('default:/movies/Arrival.mkv'), expect.any(Error));
    });
  });
});
