import Fs from 'node:fs';
import Sharp from 'sharp';
import { singleton } from 'tsyringe';
import type ApolloUserCacheFileSystem from '../../../../../../files/cache/ApolloUserCacheFileSystem.js';
import FileSystemProvider from '../../../../../../files/FileSystemProvider.js';
import type LocalFile from '../../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../../files/VirtualFile.js';
import type { GeneratedSeekThumbnails } from './generator/SeekThumbnailGenerator.js';

type CachedThumbnailData = {
  thumbnail: {
    count: number,
    size: [width: number, heigth: number],
  },
  frameTimes: GeneratedSeekThumbnails['frameTimes'],
}

@singleton()
export default class SeekThumbnailCache {
  private readonly CACHE_ID = 'media_video-seek-thumbnails';

  constructor(
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async has(videoFile: VirtualFile): Promise<boolean> {
    const cacheFileSystem = await this.getCacheFileSystem(videoFile);

    const cacheDir = await cacheFileSystem.getForFile(videoFile, this.CACHE_ID);
    return await cacheDir.exists();
  }

  async getCachedThumbnailData(videoFile: VirtualFile): Promise<CachedThumbnailData | null> {
    const cacheFileSystem = await this.getCacheFileSystem(videoFile);

    const dataFileBytes = await cacheFileSystem.acquireWriteLockForFile(videoFile, this.CACHE_ID, (writeableCacheDir) => {
      const dataFile = writeableCacheDir.getChildFile('data');
      return dataFile.file.read();
    });

    return JSON.parse(dataFileBytes.toString('utf-8'));
  }

  async getCachedThumbnail(videoFile: VirtualFile, thumbnailIndex: number): Promise<Buffer | null> {
    const cacheFileSystem = await this.getCacheFileSystem(videoFile);

    return await cacheFileSystem.acquireWriteLockForFile(videoFile, this.CACHE_ID, (writeableCacheDir) => {
      const dataFile = writeableCacheDir.getChildFile(thumbnailIndex.toString());
      return dataFile.file.read();
    });
  }

  async write(videoFile: LocalFile, generatedThumbnails: GeneratedSeekThumbnails): Promise<void> {
    const thumbnailMetadata = await Sharp(generatedThumbnails.thumbnailFiles[0]).metadata();
    if (thumbnailMetadata.width == null || thumbnailMetadata.height == null) {
      throw new Error('Failed to get frame dimensions');
    }

    const cacheFileSystem = await this.getCacheFileSystem(videoFile);

    const cachedThumbnailData: CachedThumbnailData = await cacheFileSystem.acquireWriteLockForFile(videoFile, this.CACHE_ID, async (writeableCacheDir) => {
      for (let thumbnailIndex = 0; thumbnailIndex < generatedThumbnails.thumbnailFiles.length; ++thumbnailIndex) {
        const frameFile = generatedThumbnails.thumbnailFiles[thumbnailIndex];

        const thumbnailFile = writeableCacheDir.getChildFile(thumbnailIndex.toString());
        await thumbnailFile.write(await Fs.promises.readFile(frameFile));
      }

      return {
        thumbnail: {
          count: generatedThumbnails.thumbnailFiles.length,
          size: [thumbnailMetadata.width, thumbnailMetadata.height],
        },
        frameTimes: generatedThumbnails.frameTimes,
      };
    });

    await this.writeCachedThumbnailData(cachedThumbnailData, videoFile);
  }

  private async writeCachedThumbnailData(cachedThumbnailData: CachedThumbnailData, videoFile: VirtualFile): Promise<void> {
    const cacheFileSystem = await this.getCacheFileSystem(videoFile);

    await cacheFileSystem.acquireWriteLockForFile(videoFile, this.CACHE_ID, (writeableCacheDir) => {
      const dataFile = writeableCacheDir.getChildFile('data');
      dataFile.write(Buffer.from(JSON.stringify(cachedThumbnailData)));
    });
  }

  private async getCacheFileSystem(file: VirtualFile): Promise<ApolloUserCacheFileSystem> {
    return (await this.fileSystemProvider.provideForUser(file.fileSystem.owner)).cache;
  }
}
