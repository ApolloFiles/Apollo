import sharp from 'sharp';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaFallbackImageType } from '../../../../../database/prisma-client/enums.js';
import FileProvider from '../../../../../files/FileProvider.js';
import UserProvider from '../../../../../user/UserProvider.js';
import FullLibraryMedia from '../database/media/FullLibraryMedia.js';
import AbstractMediaImageProvider, { type ImageFormat, type ImageType } from './AbstractMediaImageProvider.js';
import ImageFileConstants from './ImageFileConstants.js';
import MediaImageCache from './MediaImageCache.js';

@singleton()
export default class MediaBackdropImageProvider extends AbstractMediaImageProvider {
  private static readonly MAX_BACKDROP_WIDTH = 2560;
  private static readonly MAX_BACKDROP_HEIGHT = 1440; // 16:9 aspect ratio

  constructor(
    userProvider: UserProvider,
    fileProvider: FileProvider,
    mediaImageCache: MediaImageCache,
    databaseClient: DatabaseClient,
  ) {
    super(userProvider, fileProvider, mediaImageCache, databaseClient, ['backdrop', 'background', 'fanart', 'art']);
  }

  protected get imageType(): ImageType {
    return 'backdrop';
  }

  protected get databaseImageType(): MediaLibraryMediaFallbackImageType | null {
    return 'BACKDROP';
  }

  protected get supportedFormats() {
    return ['jpeg', 'avif'] as const satisfies ImageFormat[];
  }

  protected processImageBytes(imageBytes: Buffer, format: MediaBackdropImageProvider['supportedFormats'][number]): Promise<Buffer> {
    let backdrop = sharp(imageBytes)
      .resize({
        width: MediaBackdropImageProvider.MAX_BACKDROP_WIDTH,
        height: MediaBackdropImageProvider.MAX_BACKDROP_HEIGHT,
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

  protected generatedFallback(_media: FullLibraryMedia, _format: ImageFormat): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}
