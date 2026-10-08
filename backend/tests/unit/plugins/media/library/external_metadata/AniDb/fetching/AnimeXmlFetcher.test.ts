import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import Zlib from 'node:zlib';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type ApolloDirectoryProvider from '../../../../../../../../src/config/ApolloDirectoryProvider.js';
import ExpiringApolloCache from '../../../../../../../../src/files/cache/global/ExpiringApolloCache.js';
import { AnimeXmlFetcher } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/fetching/AnimeXmlFetcher.js';
import type { UncachedAnimeXmlFetcher } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedAnimeXmlFetcher.js';
import { createStrictDeepMock } from '../../../../../../../test-helpers.js';

const ANIME_XML = '<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>';
const CACHE_ID_PREFIX = 'anidb_http_api';
const GZIP_MAGIC_BYTES = Buffer.from([0x1f, 0x8b]);

let cacheDirectory: string;

function createFetcher(): {
  subject: AnimeXmlFetcher,
  cache: ExpiringApolloCache,
  mocks: { uncachedAnimeXmlFetcher: DeepMockProxy<UncachedAnimeXmlFetcher> },
} {
  const apolloDirectoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
  apolloDirectoryProvider.getCacheBaseDirectory.mockReturnValue(cacheDirectory);

  const cache = new ExpiringApolloCache(apolloDirectoryProvider);
  const uncachedAnimeXmlFetcher = createStrictDeepMock<UncachedAnimeXmlFetcher>();
  uncachedAnimeXmlFetcher.fetchXml.mockResolvedValue(ANIME_XML);

  return {
    subject: new AnimeXmlFetcher(uncachedAnimeXmlFetcher, cache),
    cache,
    mocks: { uncachedAnimeXmlFetcher },
  };
}

async function readCachedBytes(cache: ExpiringApolloCache, animeId: number): Promise<Buffer> {
  const cachePath = await cache.get(CACHE_ID_PREFIX, `a${animeId}`);
  return Fs.promises.readFile(cachePath!.path);
}

async function overwriteCachedBytes(cache: ExpiringApolloCache, animeId: number, bytes: Buffer): Promise<void> {
  const cachePath = await cache.get(CACHE_ID_PREFIX, `a${animeId}`);
  await Fs.promises.writeFile(cachePath!.path, bytes);
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  cacheDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-anidb-cache-test-'));
});

afterEach(async () => {
  vi.useRealTimers();
  await Fs.promises.rm(cacheDirectory, { recursive: true, force: true });
});

describe('AnimeXmlFetcher#fetchXml', () => {
  test('Fetches the xml when nothing is cached yet', async () => {
    const { subject, mocks } = createFetcher();

    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);
    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledExactlyOnceWith(1);
  });

  test('Serves a second request for the same anime from the cache', async () => {
    const { subject, mocks } = createFetcher();

    await subject.fetchXml(1);
    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);

    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(1);
  });

  test('Keeps the cached anime separate from another one', async () => {
    const { subject, mocks } = createFetcher();
    mocks.uncachedAnimeXmlFetcher.fetchXml.mockImplementation(async (animeId) => `<anime id="${animeId}"/>`);

    await expect(subject.fetchXml(1)).resolves.toBe('<anime id="1"/>');
    await expect(subject.fetchXml(2)).resolves.toBe('<anime id="2"/>');
    await expect(subject.fetchXml(1)).resolves.toBe('<anime id="1"/>');

    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
  });

  test('Serves a cached "anime not found" without asking again', async () => {
    const { subject, mocks } = createFetcher();
    mocks.uncachedAnimeXmlFetcher.fetchXml.mockResolvedValue(null);

    await expect(subject.fetchXml(1)).resolves.toBeNull();
    await expect(subject.fetchXml(1)).resolves.toBeNull();

    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(1);
  });

  test('Stores the xml gzipped', async () => {
    const { subject, cache } = createFetcher();

    await subject.fetchXml(1);

    const cachedBytes = await readCachedBytes(cache, 1);
    expect(cachedBytes.subarray(0, 2)).toEqual(GZIP_MAGIC_BYTES);
    expect(Zlib.gunzipSync(cachedBytes).toString()).toBe(ANIME_XML);
  });

  test('Leaves no partial file behind', async () => {
    const { subject, cache } = createFetcher();

    await subject.fetchXml(1);

    const cachePath = await cache.get(CACHE_ID_PREFIX, 'a1');
    await expect(Fs.promises.readdir(Path.dirname(cachePath!.path))).resolves.toEqual(['data', 'metadata']);
  });

  test('Does not cache a failed fetch', async () => {
    const { subject, mocks } = createFetcher();
    mocks.uncachedAnimeXmlFetcher.fetchXml.mockRejectedValueOnce(new Error('AniDB is unreachable'));

    await expect(subject.fetchXml(1)).rejects.toThrow('AniDB is unreachable');
    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);

    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
  });

  test('Fetches again when the cached entry cannot be read', async () => {
    const { subject, cache, mocks } = createFetcher();

    await subject.fetchXml(1);
    await overwriteCachedBytes(cache, 1, Buffer.from('not gzipped at all'));

    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);
    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });

  test('Fetches again once the cached entry expired', async () => {
    const { subject, mocks } = createFetcher();

    await subject.fetchXml(1);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (ExpiringApolloCache.TTL_ONE_DAY * 1000) + 1000);

    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);
    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
  });

  test('Still returns the fetched data when it cannot be written to the cache', async () => {
    const blockingFile = Path.join(cacheDirectory, 'not-a-directory');
    await Fs.promises.writeFile(blockingFile, '');
    const temporaryDirectory = cacheDirectory;
    cacheDirectory = Path.join(blockingFile, 'cache');
    const { subject, mocks } = createFetcher();
    cacheDirectory = temporaryDirectory;

    await expect(subject.fetchXml(1)).resolves.toEqual(ANIME_XML);
    await expect(subject.fetchXml(1)).resolves.toEqual(ANIME_XML);

    expect(mocks.uncachedAnimeXmlFetcher.fetchXml).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });
});
