import type { CachedValue } from '#src/cache/CacheEntry.js';
import type LocalFile from '#src/files/local/LocalFile.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';
import type ApolloTemporaryDirectory from '#src/files/temporary/ApolloTemporaryDirectory.js';
import type { SeekThumbnailIndex, SeekThumbnailIndexCache } from '#src/plugins/official/media/_old/video-player/seek-thumbnails/cache/SeekThumbnailIndexCache.js';
import type { SeekThumbnailSpriteCache } from '#src/plugins/official/media/_old/video-player/seek-thumbnails/cache/SeekThumbnailSpriteCache.js';
import type SeekThumbnailGenerator from '#src/plugins/official/media/_old/video-player/seek-thumbnails/generator/SeekThumbnailGenerator.js';
import WebVttSeekThumbnailGenerator from '#src/plugins/official/media/_old/video-player/seek-thumbnails/generator/WebVttSeekThumbnailGenerator.js';
import SeekThumbnailProvider from '#src/plugins/official/media/_old/video-player/seek-thumbnails/SeekThumbnailProvider.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import type { DeepMockProxy } from 'vitest-mock-extended';

const INDEX: SeekThumbnailIndex = {
  thumbnail: { count: 2, size: [2160, 1215] },
  frameTimes: [0, 4.2, 8.4],
};

function createSprite(): CachedValue<Buffer> {
  return createStrictDeepMock<CachedValue<Buffer>>();
}

function createIndexEntry(): CachedValue<SeekThumbnailIndex> {
  return createStrictDeepMock<CachedValue<SeekThumbnailIndex>>({ value: async () => INDEX });
}

describe(SeekThumbnailProvider, () => {
  let indexCache: DeepMockProxy<SeekThumbnailIndexCache>;
  let spriteCache: DeepMockProxy<SeekThumbnailSpriteCache>;
  let cachedSprites: Map<string, CachedValue<Buffer>>;
  let video: LocalFile;
  let provider: SeekThumbnailProvider;

  beforeEach(() => {
    cachedSprites = new Map([['sprite-0', createSprite()], ['sprite-1', createSprite()]]);

    indexCache = createStrictDeepMock<SeekThumbnailIndexCache>();
    indexCache.getOrCreate.mockResolvedValue(createIndexEntry());
    spriteCache = createStrictDeepMock<SeekThumbnailSpriteCache>();
    spriteCache.get.mockImplementation(async (_file, entryName) => cachedSprites.get(entryName));

    video = new LocalFileSystem('default', null, { fs_local: { pathOnHost: '/srv/media' } }).getFile('/movies/Arrival.mkv') as LocalFile;
    provider = new SeekThumbnailProvider(
      createStrictDeepMock<SeekThumbnailGenerator>(),
      new WebVttSeekThumbnailGenerator(),
      indexCache,
      spriteCache,
      createStrictDeepMock<ApolloTemporaryDirectory>(),
    );
  });

  test('Returns the cached sprite', async () => {
    await expect(provider.provideThumbnailImage(video, 1)).resolves.toBe(cachedSprites.get('sprite-1'));
  });

  test('Returns null for a sprite past the last one', async () => {
    await expect(provider.provideThumbnailImage(video, 2)).resolves.toBeNull();
  });

  describe('when nothing has been generated yet', () => {
    let generatedSprite: CachedValue<Buffer>;

    beforeEach(() => {
      cachedSprites.clear();
      generatedSprite = createSprite();
      indexCache.getOrCreate.mockImplementation(async () => {
        cachedSprites.set('sprite-1', generatedSprite);
        return createIndexEntry();
      });
    });

    test('Returns the sprite the index generation stored', async () => {
      await expect(provider.provideThumbnailImage(video, 1)).resolves.toBe(generatedSprite);
    });

    test('Does not regenerate the sprites it just generated', async () => {
      await provider.provideThumbnailImage(video, 1);

      expect(indexCache.delete).not.toHaveBeenCalled();
    });
  });

  describe('when the index outlived its sprites', () => {
    let regeneratedSprites: Map<string, CachedValue<Buffer>>;

    beforeEach(() => {
      cachedSprites.clear();
      regeneratedSprites = new Map([['sprite-0', createSprite()], ['sprite-1', createSprite()]]);
      indexCache.delete.mockImplementation(async () => {
        indexCache.getOrCreate.mockImplementationOnce(async () => {
          regeneratedSprites.forEach((sprite, entryName) => cachedSprites.set(entryName, sprite));
          return createIndexEntry();
        });
      });
    });

    test('Deletes the index, so all sprites are generated again', async () => {
      await provider.provideThumbnailImage(video, 1);

      expect(indexCache.delete).toHaveBeenCalledExactlyOnceWith(video, 'index');
    });

    test('Returns the regenerated sprite', async () => {
      await expect(provider.provideThumbnailImage(video, 1)).resolves.toBe(regeneratedSprites.get('sprite-1'));
    });

    test('Regenerates only once for concurrent requests of the same video', async () => {
      await Promise.all([provider.provideThumbnailImage(video, 0), provider.provideThumbnailImage(video, 1)]);

      expect(indexCache.delete).toHaveBeenCalledExactlyOnceWith(video, 'index');
    });

    test('Rejects when the regeneration did not produce the sprite either', async () => {
      indexCache.delete.mockResolvedValue();

      await expect(provider.provideThumbnailImage(video, 1))
        .rejects.toThrow('Seek thumbnail 1 of /srv/media/movies/Arrival.mkv is still missing after regenerating all of them');
    });
  });
});
