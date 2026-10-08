import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import Zlib from 'node:zlib';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type ApolloDirectoryProvider from '#src/config/ApolloDirectoryProvider.js';
import ExpiringApolloCache from '#src/files/cache/global/ExpiringApolloCache.js';
import { AnimeXmlFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/AnimeXmlFetcher.js';
import type { UncachedAnimeXmlFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedAnimeXmlFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const ANIME_XML = '<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>';
const CACHE_ID_PREFIX = 'anidb_http_api';
const GZIP_MAGIC_BYTES = Buffer.from([0x1f, 0x8b]);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe(AnimeXmlFetcher, () => {
  let cacheDirectory: string;
  let apolloDirectoryProvider: DeepMockProxy<ApolloDirectoryProvider>;
  let cache: ExpiringApolloCache;
  let uncachedAnimeXmlFetcher: DeepMockProxy<UncachedAnimeXmlFetcher>;
  let subject: AnimeXmlFetcher;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cacheDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-anidb-cache-test-'));

    apolloDirectoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
    apolloDirectoryProvider.getCacheBaseDirectory.mockReturnValue(cacheDirectory);
    cache = new ExpiringApolloCache(apolloDirectoryProvider);

    uncachedAnimeXmlFetcher = createStrictDeepMock<UncachedAnimeXmlFetcher>();
    uncachedAnimeXmlFetcher.fetchXml.mockResolvedValue(ANIME_XML);

    subject = new AnimeXmlFetcher(uncachedAnimeXmlFetcher, cache);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await Fs.promises.rm(cacheDirectory, { recursive: true, force: true });
  });

  async function getCachedDataPath(animeId: number): Promise<string> {
    const cachePath = await cache.get(CACHE_ID_PREFIX, `a${animeId}`);
    return cachePath!.path;
  }

  test('Fetches the xml when nothing is cached yet', async () => {
    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledExactlyOnceWith(1);
  });

  test('Serves a second request for the same anime from the cache', async () => {
    await subject.fetchXml(1);

    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledOnce();
  });

  test('Keeps the cached anime separate from another one', async () => {
    uncachedAnimeXmlFetcher.fetchXml.mockImplementation(async (animeId) => `<anime id="${animeId}"/>`);

    await expect(subject.fetchXml(1)).resolves.toBe('<anime id="1"/>');
    await expect(subject.fetchXml(2)).resolves.toBe('<anime id="2"/>');
    await expect(subject.fetchXml(1)).resolves.toBe('<anime id="1"/>');

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
  });

  test('Serves a cached "anime not found" without asking again', async () => {
    uncachedAnimeXmlFetcher.fetchXml.mockResolvedValue(null);

    await expect(subject.fetchXml(1)).resolves.toBeNull();
    await expect(subject.fetchXml(1)).resolves.toBeNull();

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledOnce();
  });

  test('Stores the xml gzipped', async () => {
    await subject.fetchXml(1);

    const cachedBytes = await Fs.promises.readFile(await getCachedDataPath(1));
    expect(cachedBytes.subarray(0, 2)).toEqual(GZIP_MAGIC_BYTES);
    expect(Zlib.gunzipSync(cachedBytes).toString()).toBe(ANIME_XML);
  });

  test('Leaves no partial file behind', async () => {
    await subject.fetchXml(1);

    const entryFiles = await Fs.promises.readdir(Path.dirname(await getCachedDataPath(1)));
    expect(entryFiles.sort()).toEqual(['data', 'metadata']);
  });

  test('Does not cache a failed fetch', async () => {
    uncachedAnimeXmlFetcher.fetchXml.mockRejectedValueOnce(new Error('AniDB is unreachable'));

    await expect(subject.fetchXml(1)).rejects.toThrow('AniDB is unreachable');
    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
  });

  test('Fetches again, and logs an error, when the cached entry cannot be read', async () => {
    await subject.fetchXml(1);
    await Fs.promises.writeFile(await getCachedDataPath(1), 'not gzipped at all');

    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Error reading AniDB XML from cache'), expect.any(Error));
  });

  test('Keeps the xml cached for a day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await subject.fetchXml(1);

    vi.setSystemTime(Date.now() + ONE_DAY_MS - 60_000);
    await subject.fetchXml(1);

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledOnce();
  });

  test('Fetches again once the cached entry has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await subject.fetchXml(1);

    vi.setSystemTime(Date.now() + ONE_DAY_MS + 60_000);
    await subject.fetchXml(1);

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
  });

  test('Still returns the fetched data, and logs an error, when it cannot be written to the cache', async () => {
    const blockingFile = Path.join(cacheDirectory, 'not-a-directory');
    await Fs.promises.writeFile(blockingFile, '');
    apolloDirectoryProvider.getCacheBaseDirectory.mockReturnValue(Path.join(blockingFile, 'cache'));

    await expect(subject.fetchXml(1)).resolves.toEqual(ANIME_XML);
    await expect(subject.fetchXml(1)).resolves.toEqual(ANIME_XML);

    expect(uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error writing the AniDB XML of anime 1 to the cache'), expect.any(Error));
  });
});
