import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type ApolloDirectoryProvider from '#src/config/ApolloDirectoryProvider.js';
import ExpiringApolloCache from '#src/files/cache/global/ExpiringApolloCache.js';
import { AniDbCdnError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { ImageFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/ImageFetcher.js';
import type { UncachedImageFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedImageFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const CACHE_ID_PREFIX = 'anidb_cdn_image';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe(ImageFetcher, () => {
  let cacheDirectory: string;
  let apolloDirectoryProvider: DeepMockProxy<ApolloDirectoryProvider>;
  let cache: ExpiringApolloCache;
  let uncachedImageFetcher: DeepMockProxy<UncachedImageFetcher>;
  let subject: ImageFetcher;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cacheDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-anidb-image-cache-test-'));

    apolloDirectoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
    apolloDirectoryProvider.getCacheBaseDirectory.mockReturnValue(cacheDirectory);
    cache = new ExpiringApolloCache(apolloDirectoryProvider);

    uncachedImageFetcher = createStrictDeepMock<UncachedImageFetcher>();
    uncachedImageFetcher.fetchImage.mockResolvedValue(IMAGE_BYTES);

    subject = new ImageFetcher(uncachedImageFetcher, cache);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await Fs.promises.rm(cacheDirectory, { recursive: true, force: true });
  });

  async function getCachedDataPath(fileName: string): Promise<string> {
    const cachePath = await cache.get(CACHE_ID_PREFIX, fileName);
    return cachePath!.path;
  }

  test('Fetches the image when nothing is cached yet', async () => {
    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledExactlyOnceWith('294282.jpg');
  });

  test('Serves a second request for the same image from the cache', async () => {
    await subject.fetchImage('294282.jpg');

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledOnce();
  });

  test('Keeps different images apart', async () => {
    const otherImage = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const imagesByFileName = new Map([['294282.jpg', IMAGE_BYTES], ['67867.png', otherImage]]);
    uncachedImageFetcher.fetchImage.mockImplementation(async (fileName) => imagesByFileName.get(fileName)!);
    await subject.fetchImage('294282.jpg');
    await subject.fetchImage('67867.png');

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);
    await expect(subject.fetchImage('67867.png')).resolves.toEqual(otherImage);

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Stores the image bytes unchanged', async () => {
    await subject.fetchImage('294282.jpg');

    await expect(Fs.promises.readFile(await getCachedDataPath('294282.jpg'))).resolves.toEqual(IMAGE_BYTES);
  });

  test('Leaves no partial file behind', async () => {
    await subject.fetchImage('294282.jpg');

    const entryFiles = await Fs.promises.readdir(Path.dirname(await getCachedDataPath('294282.jpg')));
    expect(entryFiles.sort()).toEqual(['data', 'metadata']);
  });

  test('Does not cache a failed fetch', async () => {
    const notFoundError = AniDbCdnError.createForNotFoundResponse('294282.jpg');
    uncachedImageFetcher.fetchImage.mockRejectedValueOnce(notFoundError);

    await expect(subject.fetchImage('294282.jpg')).rejects.toBe(notFoundError);
    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Fetches again when the cached image cannot be read', async () => {
    await subject.fetchImage('294282.jpg');
    await Fs.promises.rm(await getCachedDataPath('294282.jpg'));

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Keeps the image cached for a year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await subject.fetchImage('294282.jpg');

    vi.setSystemTime(Date.now() + ONE_YEAR_MS - 60_000);
    await subject.fetchImage('294282.jpg');

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledOnce();
  });

  test('Fetches again once the cached image has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await subject.fetchImage('294282.jpg');

    vi.setSystemTime(Date.now() + ONE_YEAR_MS + 60_000);
    await subject.fetchImage('294282.jpg');

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Still returns the fetched data, and logs an error, when it cannot be written to the cache', async () => {
    const blockingFile = Path.join(cacheDirectory, 'not-a-directory');
    await Fs.promises.writeFile(blockingFile, '');
    apolloDirectoryProvider.getCacheBaseDirectory.mockReturnValue(Path.join(blockingFile, 'cache'));

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);
    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error writing the AniDB image 294282.jpg to the cache'), expect.any(Error));
  });
});
