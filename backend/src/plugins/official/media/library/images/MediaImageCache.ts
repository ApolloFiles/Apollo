import { singleton } from 'tsyringe';
import type ApolloUserCacheFileSystem from '../../../../../files/cache/user/ApolloUserCacheFileSystem.js';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import type { ImageFormat, ImageType } from './AbstractMediaImageProvider.js';

@singleton()
export default class MediaImageCache {
  private readonly CACHE_ID_PREFIX = 'apollo_media-images';

  constructor(
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async get(file: VirtualFile, type: ImageType, format: ImageFormat): Promise<Buffer | null> {
    const cacheFileSystem = await this.getCacheFileSystem(file);
    const cacheFile = await cacheFileSystem.getForFile(file, this.createCacheId(type, format));

    if (await cacheFile.exists()) {
      return cacheFile.read();
    }
    return null;
  }

  async write(file: VirtualFile, type: ImageType, format: ImageFormat, data: Buffer): Promise<void> {
    const cacheFileSystem = await this.getCacheFileSystem(file);

    await cacheFileSystem.acquireWriteLockForFile(
      file,
      this.createCacheId(type, format),
      (writeableCacheFile) => writeableCacheFile.write(data),
    );
  }

  private async getCacheFileSystem(file: VirtualFile): Promise<ApolloUserCacheFileSystem> {
    return (await this.fileSystemProvider.provideForUser(file.fileSystem.getOwnerOrThrow())).cache;
  }

  private createCacheId(type: ImageType, format: ImageFormat): string {
    return `${this.CACHE_ID_PREFIX}-${type}.${format}`;
  }
}
