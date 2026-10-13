import { AppCache } from '#src/cache/AppCache.js';
import { CacheCodecs } from '#src/cache/CacheCodec.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import { TimeUnit } from '@spraxdev/node-commons/util';
import Crypto from 'node:crypto';
import Path from 'node:path';

class AnimeXmlCache extends AppCache<string> {
  constructor(services: CacheServices, namespace: string, version = 1) {
    super(services, { namespace, version, codec: CacheCodecs.text(), expiry: { freshMs: TimeUnit.DAYS.toMillis(1) } });
  }
}

const ANIME_XML = '<anime id="17"><title>Cowboy Bebop</title></anime>';

describe(AppCache, () => {
  let databaseClient: DatabaseClient;
  let tmpDir: string;
  let namespace: string;
  let services: CacheServices;
  let cache: AnimeXmlCache;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    namespace = `anidb.anime-xml.${Crypto.randomUUID()}`;
    ({ services } = createCacheTestServices(databaseClient, Path.join(tmpDir, 'cache')));
    cache = new AnimeXmlCache(services, namespace);
  });

  afterEach(async () => {
    await databaseClient.cacheAppEntry.deleteMany({ where: { namespace } });
  });

  test('Rejects an invalid definition when constructed', () => {
    expect(() => new AnimeXmlCache(services, 'AniDB')).toThrow('Invalid cache namespace \'AniDB\'');
  });

  test('Returns a value it created earlier', async () => {
    await using _created = await cache.getOrCreate('17', async () => ANIME_XML);

    await using entry = await cache.get('17');

    await expect(entry!.value()).resolves.toBe(ANIME_XML);
  });

  test('Stores its entries in the app table, with its definition\'s expiry', async () => {
    await cache.set('17', ANIME_XML);

    const row = await databaseClient.cacheAppEntry.findFirstOrThrow({ where: { namespace } });
    expect(row.keepUntil!.getTime() - row.createdAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test('Misses an entry after deleting it', async () => {
    await cache.set('17', ANIME_XML);

    await cache.delete('17');

    await expect(cache.get('17')).resolves.toBeUndefined();
  });
});
