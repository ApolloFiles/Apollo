import sharp from 'sharp';
import { singleton } from 'tsyringe';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import VirtualFile from '../../../../../files/VirtualFile.js';
import UserProvider from '../../../../../user/UserProvider.js';
import type MediaLibraryMedia from '../database/MediaLibraryMedia.js';
import AbstractMediaImageProvider, { type ImageFormat, type ImageType } from './AbstractMediaImageProvider.js';
import ImageFileConstants from './ImageFileConstants.js';
import MediaImageCache from './MediaImageCache.js';

@singleton()
export default class MediaBackdropImageProvider extends AbstractMediaImageProvider {
  private static readonly MAX_BACKDROP_WIDTH = 2560;
  private static readonly MAX_BACKDROP_HEIGHT = 1440; // 16:9 aspect ratio

  constructor(
    userProvider: UserProvider,
    fileSystemProvider: FileSystemProvider,
    mediaImageCache: MediaImageCache,
  ) {
    super(userProvider, fileSystemProvider, mediaImageCache, ['backdrop', 'background', 'fanart', 'art']);
  }

  protected get imageType(): ImageType {
    return 'backdrop';
  }

  protected async processImageFile(imageFile: VirtualFile, format: ImageFormat): Promise<Buffer> {
    let backdrop = sharp(await imageFile.read())
      .resize(
        MediaBackdropImageProvider.MAX_BACKDROP_WIDTH,
        MediaBackdropImageProvider.MAX_BACKDROP_HEIGHT,
        {
          fit: 'inside',
          withoutEnlargement: true,
        })
      .flatten({ background: { r: 0, g: 0, b: 0 } });

    if (format === 'avif') {
      backdrop = backdrop.avif(ImageFileConstants.BACKDROP_OPTIONS_AVIF);
    } else {
      backdrop = backdrop.jpeg(ImageFileConstants.BACKDROP_OPTIONS_JPEG);
    }

    return backdrop.toBuffer();
  }

  protected generatedFallback(_media: MediaLibraryMedia, _format: ImageFormat): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}
