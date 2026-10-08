import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import ExpiringApolloCache from '../../../../../../../files/cache/global/ExpiringApolloCache.js';
import { UncachedImageFetcher } from './UncachedImageFetcher.js';

/** @internal */
@singleton()
export class ImageFetcher {
  private static readonly CACHE_ID_PREFIX = 'anidb_cdn_image';

  constructor(
    private readonly uncachedImageFetcher: UncachedImageFetcher,
    private readonly expiringApolloCache: ExpiringApolloCache,  // FIXME: Replace!!! (maybe with an implementation that can server stale items on error?)
  ) {
  }

  async fetchImage(fileName: string): Promise<Buffer> {
    const cachedImage = await this.readFromCache(fileName);
    if (cachedImage != null) {
      return cachedImage;
    }

    const image = await this.uncachedImageFetcher.fetchImage(fileName);
    await this.tryWriteToCache(fileName, image);
    return image;
  }

  private async readFromCache(fileName: string): Promise<Buffer | null> {
    try {
      const cachePath = await this.expiringApolloCache.get(ImageFetcher.CACHE_ID_PREFIX, fileName);
      if (cachePath == null) {
        return null;
      }

      return await Fs.promises.readFile(cachePath.path);
    } catch (err) {
      console.error('Error reading AniDB image from cache:', err);
      return null;
    }
  }

  private async tryWriteToCache(fileName: string, image: Buffer): Promise<void> {
    try {
      await this.writeToCache(fileName, image);
    } catch (err) {
      console.error(`Error writing the AniDB image ${fileName} to the cache:`, err);
    }
  }

  private async writeToCache(fileName: string, image: Buffer): Promise<void> {
    const cachePath = await this.expiringApolloCache.createOrUpdateTtl(ImageFetcher.CACHE_ID_PREFIX, fileName, ExpiringApolloCache.TTL_ONE_YEAR);

    await Fs.promises.writeFile(`${cachePath.path}.part`, image);
    await Fs.promises.rename(`${cachePath.path}.part`, cachePath.path);
  }
}
