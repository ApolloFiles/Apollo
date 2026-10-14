import type { DeepMockProxy } from 'vitest-mock-extended';
import type { CacheFactory } from '#src/cache/CacheFactory.js';
import { InMemoryCacheEntry } from '#src/cache/internal/entry/InMemoryCacheEntry.js';
import type { AniDbImageCache } from '#src/plugins/official/media/library/external_metadata/AniDb/cache/AniDbImageCache.js';
import { AniDbCdnError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { AniDbErrorClassifier } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbErrorClassifier.js';
import { ImageFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/ImageFetcher.js';
import type { UncachedImageFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedImageFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const FACTORY_CONTEXT = { tempPath: '/tmp/apollo-cache/0b1f7a0e', fromTempFile: () => { throw new Error('Not expected to be used'); } };

describe(ImageFetcher, () => {
  let imageCache: DeepMockProxy<AniDbImageCache>;
  let uncachedImageFetcher: DeepMockProxy<UncachedImageFetcher>;
  let subject: ImageFetcher;

  beforeEach(() => {
    imageCache = createStrictDeepMock<AniDbImageCache>();
    imageCache.getOrCreate.mockImplementation(async (_key, factory) => runFactory(factory));

    const imagesByFileName = new Map([['294282.jpg', JPEG_BYTES], ['67867.png', PNG_BYTES]]);
    uncachedImageFetcher = createStrictDeepMock<UncachedImageFetcher>();
    uncachedImageFetcher.fetchImage.mockImplementation(async (fileName) => imagesByFileName.get(fileName)!);

    subject = new ImageFetcher(uncachedImageFetcher, imageCache);
  });

  async function runFactory(factory: CacheFactory<Buffer>): Promise<InMemoryCacheEntry<Buffer>> {
    const image = await factory(FACTORY_CONTEXT) as Buffer;
    return new InMemoryCacheEntry(image, (data) => data, false, new Date(), null, null);
  }

  test('Looks the image up in the cache by its file name', async () => {
    await subject.fetchImage('294282.jpg');

    expect(imageCache.getOrCreate).toHaveBeenCalledExactlyOnceWith('294282.jpg', expect.any(Function), expect.anything());
  });

  test('Serves a stale cache entry only for failures that might go away', async () => {
    await subject.fetchImage('294282.jpg');

    expect(imageCache.getOrCreate).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.any(Function), { serveStaleOnError: AniDbErrorClassifier.isTransient });
  });

  test('Returns the cached image bytes', async () => {
    imageCache.getOrCreate.mockResolvedValue(new InMemoryCacheEntry(JPEG_BYTES, (data) => data, false, new Date(), null, null));

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(JPEG_BYTES);
  });

  test('Fetches the requested image from the CDN on a cache miss', async () => {
    await expect(subject.fetchImage('67867.png')).resolves.toEqual(PNG_BYTES);
  });

  test('Passes on the error when the CDN does not deliver the image and nothing is cached', async () => {
    const notFoundError = AniDbCdnError.createForNotFoundResponse('294282.jpg');
    uncachedImageFetcher.fetchImage.mockRejectedValue(notFoundError);

    await expect(subject.fetchImage('294282.jpg')).rejects.toBe(notFoundError);
  });
});
