import type { DeepMockProxy } from 'vitest-mock-extended';
import type { CacheFactory } from '#src/cache/CacheFactory.js';
import { InMemoryCacheEntry } from '#src/cache/internal/entry/InMemoryCacheEntry.js';
import { NullCacheEntry } from '#src/cache/internal/entry/NullCacheEntry.js';
import type { AniDbAnimeXmlCache } from '#src/plugins/official/media/library/external_metadata/AniDb/cache/AniDbAnimeXmlCache.js';
import { AniDbErrorClassifier } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbErrorClassifier.js';
import { AnimeXmlFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/AnimeXmlFetcher.js';
import type { UncachedAnimeXmlFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedAnimeXmlFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const ANIME_XML = '<?xml version="1.0" encoding="UTF-8"?><anime id="17"><type>TV Series</type></anime>';
const FACTORY_CONTEXT = { tempPath: '/tmp/apollo-cache/0b1f7a0e', fromTempFile: () => { throw new Error('Not expected to be used'); } };

describe(AnimeXmlFetcher, () => {
  let animeXmlCache: DeepMockProxy<AniDbAnimeXmlCache>;
  let uncachedAnimeXmlFetcher: DeepMockProxy<UncachedAnimeXmlFetcher>;
  let subject: AnimeXmlFetcher;

  beforeEach(() => {
    animeXmlCache = createStrictDeepMock<AniDbAnimeXmlCache>();
    animeXmlCache.getOrCreate.mockImplementation(async (_key, factory) => runFactory(factory));

    uncachedAnimeXmlFetcher = createStrictDeepMock<UncachedAnimeXmlFetcher>();
    uncachedAnimeXmlFetcher.fetchXml.mockImplementation(async (animeId) => `<anime id="${animeId}"/>`);

    subject = new AnimeXmlFetcher(uncachedAnimeXmlFetcher, animeXmlCache);
  });

  async function runFactory(factory: CacheFactory<string | null>): Promise<InMemoryCacheEntry<string> | NullCacheEntry> {
    const result = await factory(FACTORY_CONTEXT);
    if (result === null) {
      return new NullCacheEntry(false, new Date());
    }
    return new InMemoryCacheEntry(Buffer.from(result as string), (data) => data.toString(), false, new Date(), null, 'application/xml');
  }

  test('Looks the anime up in the cache by its id', async () => {
    await subject.fetchXml(17);

    expect(animeXmlCache.getOrCreate).toHaveBeenCalledExactlyOnceWith('17', expect.any(Function), expect.anything());
  });

  test('Serves a stale cache entry only for failures that might go away', async () => {
    await subject.fetchXml(17);

    expect(animeXmlCache.getOrCreate).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.any(Function), { serveStaleOnError: AniDbErrorClassifier.isTransient });
  });

  test('Returns the cached xml', async () => {
    animeXmlCache.getOrCreate.mockResolvedValue(new InMemoryCacheEntry(Buffer.from(ANIME_XML), (data) => data.toString(), false, new Date(), null, 'application/xml'));

    await expect(subject.fetchXml(17)).resolves.toBe(ANIME_XML);
  });

  test('Returns null when the cache knows the anime does not exist', async () => {
    animeXmlCache.getOrCreate.mockResolvedValue(new NullCacheEntry(false, new Date()));

    await expect(subject.fetchXml(17)).resolves.toBeNull();
  });

  test('Fetches the xml of the requested anime from AniDB on a cache miss', async () => {
    await expect(subject.fetchXml(17)).resolves.toBe('<anime id="17"/>');
  });

  test('Fetches "anime not found" from AniDB on a cache miss', async () => {
    uncachedAnimeXmlFetcher.fetchXml.mockResolvedValue(null);

    await expect(subject.fetchXml(17)).resolves.toBeNull();
  });

  test('Passes on the error when AniDB cannot be reached and nothing is cached', async () => {
    uncachedAnimeXmlFetcher.fetchXml.mockRejectedValue(new Error('AniDB is unreachable'));

    await expect(subject.fetchXml(17)).rejects.toThrow(new Error('AniDB is unreachable'));
  });
});
