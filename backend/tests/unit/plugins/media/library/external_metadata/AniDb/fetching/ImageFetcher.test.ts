import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type ApolloDirectoryProvider from '../../../../../../../../src/config/ApolloDirectoryProvider.js';
import ExpiringApolloCache from '../../../../../../../../src/files/cache/global/ExpiringApolloCache.js';
import { AniDbCdnError } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { ImageFetcher } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/fetching/ImageFetcher.js';
import type { UncachedImageFetcher } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedImageFetcher.js';
import { createStrictDeepMock } from '../../../../../../../test-helpers.js';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const CACHE_ID_PREFIX = 'anidb_cdn_image';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

let cacheDirectory: string;

function createFetcher(): {
  subject: ImageFetcher,
  cache: ExpiringApolloCache,
  mocks: { uncachedImageFetcher: DeepMockProxy<UncachedImageFetcher> },
} {
  const apolloDirectoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
  apolloDirectoryProvider.getCacheBaseDirectory.mockReturnValue(cacheDirectory);

  const cache = new ExpiringApolloCache(apolloDirectoryProvider);
  const uncachedImageFetcher = createStrictDeepMock<UncachedImageFetcher>();
  uncachedImageFetcher.fetchImage.mockResolvedValue(IMAGE_BYTES);

  return {
    subject: new ImageFetcher(uncachedImageFetcher, cache),
    cache,
    mocks: { uncachedImageFetcher },
  };
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  cacheDirectory = await Fs.promises.mkdtemp(Path.join(Os.tmpdir(), 'apollo-anidb-image-cache-test-'));
});

afterEach(async () => {
  vi.useRealTimers();
  await Fs.promises.rm(cacheDirectory, { recursive: true, force: true });
});

describe('ImageFetcher#fetchImage', () => {
  test('Fetches the image when nothing is cached yet', async () => {
    const { subject, mocks } = createFetcher();

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledExactlyOnceWith('294282.jpg');
  });

  test('Serves a second request for the same image from the cache', async () => {
    const { subject, mocks } = createFetcher();

    await subject.fetchImage('294282.jpg');
    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledOnce();
  });

  test('Keeps different images apart', async () => {
    const { subject, mocks } = createFetcher();
    const otherImage = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mocks.uncachedImageFetcher.fetchImage.mockImplementation(async (fileName) => fileName === '67867.png' ? otherImage : IMAGE_BYTES);

    await subject.fetchImage('294282.jpg');
    await subject.fetchImage('67867.png');

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);
    await expect(subject.fetchImage('67867.png')).resolves.toEqual(otherImage);
    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Stores the image bytes unchanged', async () => {
    const { subject, cache } = createFetcher();

    await subject.fetchImage('294282.jpg');

    const cachePath = await cache.get(CACHE_ID_PREFIX, '294282.jpg');
    await expect(Fs.promises.readFile(cachePath!.path)).resolves.toEqual(IMAGE_BYTES);
  });

  test('Leaves no partial file behind', async () => {
    const { subject, cache } = createFetcher();

    await subject.fetchImage('294282.jpg');

    const cachePath = await cache.get(CACHE_ID_PREFIX, '294282.jpg');
    await expect(Fs.promises.access(`${cachePath!.path}.part`)).rejects.toThrow();
  });

  test('Does not cache a failed fetch', async () => {
    const { subject, mocks } = createFetcher();
    mocks.uncachedImageFetcher.fetchImage.mockRejectedValueOnce(AniDbCdnError.createForNotFoundResponse('294282.jpg'));

    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow(AniDbCdnError);
    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Fetches again when the cached image cannot be read', async () => {
    const { subject, cache, mocks } = createFetcher();
    await subject.fetchImage('294282.jpg');

    const cachePath = await cache.get(CACHE_ID_PREFIX, '294282.jpg');
    await Fs.promises.rm(cachePath!.path);

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);
    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Keeps the image cached for a year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { subject, mocks } = createFetcher();
    await subject.fetchImage('294282.jpg');

    vi.setSystemTime(Date.now() + ONE_YEAR_MS - 60_000);
    await subject.fetchImage('294282.jpg');

    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledOnce();
  });

  test('Fetches again once the cached image has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { subject, mocks } = createFetcher();
    await subject.fetchImage('294282.jpg');

    vi.setSystemTime(Date.now() + ONE_YEAR_MS + 60_000);
    await subject.fetchImage('294282.jpg');

    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
  });

  test('Still returns the fetched data when it cannot be written to the cache', async () => {
    const blockingFile = Path.join(cacheDirectory, 'not-a-directory');
    await Fs.promises.writeFile(blockingFile, '');
    const temporaryDirectory = cacheDirectory;
    cacheDirectory = Path.join(blockingFile, 'cache');
    const { subject, mocks } = createFetcher();
    cacheDirectory = temporaryDirectory;

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);
    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);

    expect(mocks.uncachedImageFetcher.fetchImage).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });
});
