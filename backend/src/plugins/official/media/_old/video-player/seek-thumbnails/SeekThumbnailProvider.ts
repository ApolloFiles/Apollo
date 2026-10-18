import Fs from 'node:fs';
import Sharp from 'sharp';
import { singleton } from 'tsyringe';
import type { CachedValue } from '../../../../../../cache/CacheEntry.js';
import type LocalFile from '../../../../../../files/local/LocalFile.js';
import ApolloTemporaryDirectory from '../../../../../../files/temporary/ApolloTemporaryDirectory.js';
import { InFlightRequestTracker } from '../../../../../../utils/InFlightRequestTracker.js';
import { type SeekThumbnailIndex, SeekThumbnailIndexCache } from './cache/SeekThumbnailIndexCache.js';
import { SeekThumbnailSpriteCache } from './cache/SeekThumbnailSpriteCache.js';
import SeekThumbnailGenerator from './generator/SeekThumbnailGenerator.js';
import WebVttSeekThumbnailGenerator from './generator/WebVttSeekThumbnailGenerator.js';

@singleton()
export default class SeekThumbnailProvider {
  private static readonly INDEX_ENTRY_NAME = 'index';

  private readonly regenerations = new InFlightRequestTracker<void>();

  constructor(
    private readonly seekThumbnailsGenerator: SeekThumbnailGenerator,
    private readonly webVttGenerator: WebVttSeekThumbnailGenerator,
    private readonly indexCache: SeekThumbnailIndexCache,
    private readonly spriteCache: SeekThumbnailSpriteCache,
    private readonly apolloTemporaryDirectory: ApolloTemporaryDirectory,
  ) {
  }

  async provideWebVtt(file: LocalFile, thumbnailUrlGenerator: (frameIndex: number) => string): Promise<string> {
    const thumbnailIndex = await this.provideIndex(file);
    return this.webVttGenerator.generate(
      thumbnailIndex.thumbnail.count,
      thumbnailIndex.thumbnail.size,
      SeekThumbnailGenerator.GRID_SIZE,
      thumbnailIndex.frameTimes,
      thumbnailUrlGenerator,
    );
  }

  async provideThumbnailImage(file: LocalFile, thumbnailIndex: number): Promise<CachedValue<Buffer> | null> {
    const cachedSprite = await this.spriteCache.get(file, this.toSpriteEntryName(thumbnailIndex));
    if (cachedSprite != null) {
      return cachedSprite;
    }

    if (thumbnailIndex >= (await this.provideIndex(file)).thumbnail.count) {
      return null;
    }

    const generatedSprite = await this.spriteCache.get(file, this.toSpriteEntryName(thumbnailIndex));
    if (generatedSprite != null) {
      return generatedSprite;
    }

    await this.regenerateAll(file);
    const regeneratedSprite = await this.spriteCache.get(file, this.toSpriteEntryName(thumbnailIndex));
    if (regeneratedSprite == null) {
      throw new Error(`Seek thumbnail ${thumbnailIndex} of ${file.getAbsolutePathOnHost()} is still missing after regenerating all of them`);
    }
    return regeneratedSprite;
  }

  /** For an index that outlived one of its sprites; requests missing sprites of the same file share one regeneration */
  private regenerateAll(file: LocalFile): Promise<void> {
    return this.regenerations.run(file.getAbsolutePathOnHost(), async () => {
      await this.indexCache.delete(file, SeekThumbnailProvider.INDEX_ENTRY_NAME);
      await this.provideIndex(file);
    });
  }

  private async provideIndex(file: LocalFile): Promise<SeekThumbnailIndex> {
    const cacheEntry = await this.indexCache.getOrCreate(file, SeekThumbnailProvider.INDEX_ENTRY_NAME, () => this.generate(file));
    return cacheEntry.value();
  }

  private generate(file: LocalFile): Promise<SeekThumbnailIndex> {
    return this.apolloTemporaryDirectory.createScoped((tmpDir) => this.generateAndCacheSprites(file, tmpDir));
  }

  /** Sprites that fail to store only log a warning, so the index can still end up cached without them */
  private async generateAndCacheSprites(videoFile: LocalFile, targetDirPath: string): Promise<SeekThumbnailIndex> {
    const generatedThumbnails = await this.seekThumbnailsGenerator.generate(videoFile, targetDirPath);
    const thumbnailMetadata = await Sharp(generatedThumbnails.thumbnailFiles[0]).metadata();
    if (thumbnailMetadata.width == null || thumbnailMetadata.height == null) {
      throw new Error('Failed to get frame dimensions');
    }

    for (let thumbnailIndex = 0; thumbnailIndex < generatedThumbnails.thumbnailFiles.length; ++thumbnailIndex) {
      const frameFile = generatedThumbnails.thumbnailFiles[thumbnailIndex];
      await this.spriteCache.set(videoFile, this.toSpriteEntryName(thumbnailIndex), await Fs.promises.readFile(frameFile));
    }

    return {
      thumbnail: {
        count: generatedThumbnails.thumbnailFiles.length,
        size: [thumbnailMetadata.width, thumbnailMetadata.height],
      },
      frameTimes: generatedThumbnails.frameTimes,
    };
  }

  private toSpriteEntryName(thumbnailIndex: number): string {
    return `sprite-${thumbnailIndex}`;
  }
}
