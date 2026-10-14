import { singleton } from 'tsyringe';
import { AniDbImageCache } from '../cache/AniDbImageCache.js';
import { AniDbErrorClassifier } from '../errors/AniDbErrorClassifier.js';
import { UncachedImageFetcher } from './UncachedImageFetcher.js';

/** @internal */
@singleton()
export class ImageFetcher {
  constructor(
    private readonly uncachedImageFetcher: UncachedImageFetcher,
    private readonly imageCache: AniDbImageCache,
  ) {
  }

  async fetchImage(fileName: string): Promise<Buffer> {
    const cacheEntry = await this.imageCache.getOrCreate(
      fileName,
      () => this.uncachedImageFetcher.fetchImage(fileName),
      { serveStaleOnError: AniDbErrorClassifier.isTransient },
    );
    return cacheEntry.value();
  }
}
