import { TimeUnit } from '@spraxdev/node-commons/util';
import Path from 'node:path';
import Sharp from 'sharp';
import { singleton } from 'tsyringe';
import type { CachedValue } from '../../../../../cache/CacheEntry.js';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import UserProvider from '../../../../../user/UserProvider.js';
import type FullLibraryMediaItem from '../database/media-item/FullLibraryMediaItem.js';
import ImageFileConstants from '../images/ImageFileConstants.js';
import { VideoThumbnailCache } from './VideoThumbnailCache.js';
import VideoThumbnailGenerator from './VideoThumbnailGenerator.js';

@singleton()
export default class VideoThumbnailProvider {
  constructor(
    private readonly thumbnailCache: VideoThumbnailCache,
    private readonly videoThumbnailGenerator: VideoThumbnailGenerator,
    private readonly userProvider: UserProvider,
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async provide(mediaItem: FullLibraryMediaItem, format: 'jpeg' | 'avif'): Promise<CachedValue<Buffer>> {
    const file = await this.findMediaItemFile(mediaItem);
    if (!(file instanceof LocalFile)) {
      throw new Error('video thumbnail provider only supports LocalFile');
    }

    if (format === 'avif') {
      return this.provideAvifThumbnail(file);
    }

    if (format === 'jpeg') {
      return this.thumbnailCache.getOrCreate(
        file,
        'jpeg',
        () => this.deriveJpegThumbnail(file),
        {
          contentType: 'image/jpeg',
          expiry: { freshMs: TimeUnit.DAYS.toMillis(30) },
        },
      );
    }

    throw new Error(`unsupported format: ${format}`);
  }

  private async generateAvifThumbnail(file: LocalFile): Promise<Buffer> {
    const thumbnail = await this.videoThumbnailGenerator.generate(file);
    return thumbnail
      .avif(ImageFileConstants.THUMBNAIL_OPTIONS_AVIF)
      .toBuffer();
  }

  private async deriveJpegThumbnail(file: LocalFile): Promise<Buffer> {
    const avifThumbnail = await this.provideAvifThumbnail(file);
    return Sharp(await avifThumbnail.value())
      .jpeg(ImageFileConstants.THUMBNAIL_OPTIONS_JPEG)
      .toBuffer();
  }

  private provideAvifThumbnail(file: LocalFile): Promise<CachedValue<Buffer>> {
    return this.thumbnailCache.getOrCreate(
      file,
      'avif',
      () => this.generateAvifThumbnail(file),
      { contentType: 'image/avif' },
    );
  }

  private async findMediaItemFile(mediaItem: FullLibraryMediaItem): Promise<VirtualFile> {
    const fileSystems = await this.getOwnerFileSystems(mediaItem);
    return fileSystems.user[0].getFile(Path.join(mediaItem.mediaBaseDirectoryUri.filePath, mediaItem.relativeFilePath));
  }

  private async getOwnerFileSystems(mediaItem: FullLibraryMediaItem) {
    const mediaOwner = await this.userProvider.findById(mediaItem.libraryOwnerId);
    if (mediaOwner == null) {
      throw new Error(`Unable to resolve ApolloUser with ID ${JSON.stringify(mediaItem.libraryOwnerId)}`);
    }
    return await this.fileSystemProvider.provideForUser(mediaOwner);
  }
}
