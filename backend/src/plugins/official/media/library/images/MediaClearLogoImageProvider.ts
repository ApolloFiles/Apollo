import sharp from 'sharp';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaFallbackImageType } from '../../../../../database/prisma-client/enums.js';
import FileProvider from '../../../../../files/FileProvider.js';
import UserProvider from '../../../../../user/UserProvider.js';
import type MediaLibraryMedia from '../database/MediaLibraryMedia.js';
import AbstractMediaImageProvider, { type ImageFormat, type ImageType } from './AbstractMediaImageProvider.js';
import ImageFileConstants from './ImageFileConstants.js';
import MediaImageCache from './MediaImageCache.js';

@singleton()
export default class MediaClearLogoImageProvider extends AbstractMediaImageProvider {
  private static readonly MAX_LOGO_HEIGHT = 500;

  constructor(
    userProvider: UserProvider,
    fileProvider: FileProvider,
    mediaImageCache: MediaImageCache,
    databaseClient: DatabaseClient,
  ) {
    super(userProvider, fileProvider, mediaImageCache, databaseClient, ['clearlogo', 'logo']);
  }

  protected get imageType(): ImageType {
    return 'logo';
  }

  protected get databaseImageType(): MediaLibraryMediaFallbackImageType | null {
    return 'LOGO';
  }

  protected get supportedFormats() {
    return ['png', 'avif'] as const satisfies ImageFormat[];
  }

  protected processImageBytes(imageBytes: Buffer, format: MediaClearLogoImageProvider['supportedFormats'][number]): Promise<Buffer> {
    let logo = sharp(imageBytes)
      .resize({
        height: MediaClearLogoImageProvider.MAX_LOGO_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (format === 'avif') {
      logo = logo.avif(ImageFileConstants.LOGO_OPTIONS_AVIF);
    } else {
      logo = logo.png(ImageFileConstants.LOGO_OPTIONS_PNG);
    }

    return logo.toBuffer();
  }

  protected generatedFallback(_media: MediaLibraryMedia, _format: ImageFormat): Promise<Buffer | null> {
    return Promise.resolve(null);
  }
}
