import Path from 'node:path';
import { singleton } from 'tsyringe';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import UserProvider from '../../../../../user/UserProvider.js';
import type MediaLibraryMediaItem from '../database/MediaLibraryMediaItem.js';
import ImageFileConstants from '../images/ImageFileConstants.js';
import MediaImageCache from '../images/MediaImageCache.js';
import VideoThumbnailFrameExtractor from './VideoThumbnailFrameExtractor.js';

@singleton()
export default class VideoThumbnailProvider {
  constructor(
    private readonly videoThumbnailFrameExtractor: VideoThumbnailFrameExtractor,
    private readonly mediaImageCache: MediaImageCache,
    private readonly userProvider: UserProvider,
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async provide(mediaItem: MediaLibraryMediaItem, format: 'jpeg' | 'avif'): Promise<Buffer> {
    const file = await this.findMediaItemFile(mediaItem);

    if (!(file instanceof LocalFile)) {
      throw new Error('video thumbnail provider only supports LocalFile');
    }

    let imageData = await this.mediaImageCache.get(file, 'thumbnail', format);
    if (imageData != null) {
      return imageData;
    }

    const thumbnails = await this.generateAndCacheThumbnailFrames(file);
    if (format === 'jpeg') {
      return thumbnails.jpeg;
    } else if (format === 'avif') {
      return thumbnails.avif;
    }

    throw new Error(`unsupported format: ${format}`);
  }

  private async generateAndCacheThumbnailFrames(file: LocalFile): Promise<{ jpeg: Buffer, avif: Buffer }> {
    const thumbnail = await this.videoThumbnailFrameExtractor.extractThumbnailFrame(file);
    const [jpegBuffer, avifBuffer] = await Promise.all([
      thumbnail.clone().jpeg(ImageFileConstants.THUMBNAIL_OPTIONS_JPEG).toBuffer(),
      thumbnail.avif(ImageFileConstants.THUMBNAIL_OPTIONS_AVIF).toBuffer(),
    ]);

    await Promise.all([
      this.mediaImageCache.write(file, 'thumbnail', 'jpeg', jpegBuffer),
      this.mediaImageCache.write(file, 'thumbnail', 'avif', avifBuffer),
    ]);

    return {
      jpeg: jpegBuffer,
      avif: avifBuffer,
    };
  }


  private async findMediaItemFile(mediaItem: MediaLibraryMediaItem): Promise<VirtualFile> {
    const fileSystems = await this.getOwnerFileSystems(mediaItem);
    return fileSystems.user[0].getFile(Path.join(mediaItem.mediaBaseDirectoryUri.filePath, mediaItem.relativeFilePath));
  }

  private async getOwnerFileSystems(mediaItem: MediaLibraryMediaItem) {
    const mediaOwner = await this.userProvider.findById(mediaItem.libraryOwnerId);
    if (mediaOwner == null) {
      throw new Error(`Unable to resolve ApolloUser with ID ${JSON.stringify(mediaItem.libraryOwnerId)}`);
    }

    return await this.fileSystemProvider.provideForUser(mediaOwner);
  }
}
