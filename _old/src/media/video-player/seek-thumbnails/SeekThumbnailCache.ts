import Fs from 'node:fs';
import Sharp from 'sharp';
import { singleton } from 'tsyringe';
import FileSystemBasedCache from '../../../cache/FileSystemBasedCache';
import ApolloUser from '../../../user/ApolloUser';
import LocalFile from '../../../user/files/local/LocalFile';
import VirtualFile from '../../../user/files/VirtualFile';
import { GeneratedSeekThumbnails } from './generator/SeekThumbnailGenerator';

type CachedThumbnailData = {
  thumbnail: {
    count: number,
    size: [width: number, heigth: number],
  }
  frameTimes: GeneratedSeekThumbnails['frameTimes']
}

@singleton()
export default class SeekThumbnailCache {
  constructor(
    private readonly cache: FileSystemBasedCache,
  ) {
  }

  async has(videoFile: VirtualFile): Promise<boolean> {
    const cacheKeyPrefix = await this.createCacheKeyPrefix(videoFile);
    return await this.cache.userAssociatedCachedFileExists(videoFile.fileSystem.owner, `${cacheKeyPrefix};data`);
  }

  async getCachedThumbnailData(videoFile: VirtualFile): Promise<CachedThumbnailData | null> {
    const cacheKeyPrefix = await this.createCacheKeyPrefix(videoFile);
    return await this.readCachedThumbnailData(videoFile.fileSystem.owner, cacheKeyPrefix);
  }

  async getCachedThumbnail(videoFile: VirtualFile, thumbnailIndex: number): Promise<Buffer | null> {
    const cacheKeyPrefix = await this.createCacheKeyPrefix(videoFile);
    return await this.cache.getUserAssociatedCachedFile(videoFile.fileSystem.owner, `${cacheKeyPrefix};${thumbnailIndex}`);
  }

  async write(videoFile: LocalFile, generatedThumbnails: GeneratedSeekThumbnails): Promise<void> {
    const thumbnailMetadata = await Sharp(generatedThumbnails.thumbnailFiles[0]).metadata();
    if (thumbnailMetadata.width == null || thumbnailMetadata.height == null) {
      throw new Error('Failed to get frame dimensions');
    }

    const cacheKeyPrefix = await this.createCacheKeyPrefix(videoFile);

    for (let thumbnailIndex = 0; thumbnailIndex < generatedThumbnails.thumbnailFiles.length; ++thumbnailIndex) {
      const frameFile = generatedThumbnails.thumbnailFiles[thumbnailIndex];
      await this.cache.setUserAssociatedCachedFile(videoFile.fileSystem.owner, `${cacheKeyPrefix};${thumbnailIndex}`, await Fs.promises.readFile(frameFile));
    }

    const cachedThumbnailData: CachedThumbnailData = {
      thumbnail: {
        count: generatedThumbnails.thumbnailFiles.length,
        size: [thumbnailMetadata.width, thumbnailMetadata.height],
      },
      frameTimes: generatedThumbnails.frameTimes,
    };
    await this.writeCachedThumbnailData(cachedThumbnailData, videoFile.fileSystem.owner, cacheKeyPrefix);
  }

  private async createCacheKeyPrefix(file: VirtualFile): Promise<string> {
    return 'video-seek-thumbnails;' + file.toUrl() + ';' + (await file.stat()).mtimeMs;
  }

  private async readCachedThumbnailData(fileOwner: ApolloUser, cacheKeyPrefix: string): Promise<CachedThumbnailData | null> {
    const dataBytes = (await this.cache.getUserAssociatedCachedFile(fileOwner, `${cacheKeyPrefix};data`));
    if (dataBytes == null) {
      return null;
    }

    return JSON.parse(dataBytes.toString('utf-8'));
  }

  private async writeCachedThumbnailData(cachedThumbnailData: CachedThumbnailData, fileOwner: ApolloUser, cacheKeyPrefix: string): Promise<void> {
    return await this.cache.setUserAssociatedCachedFile(
      fileOwner,
      `${cacheKeyPrefix};data`,
      Buffer.from(JSON.stringify(cachedThumbnailData)),
    );
  }
}
