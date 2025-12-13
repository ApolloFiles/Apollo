import sharp from 'sharp';
import { singleton } from 'tsyringe';
import FileProvider from '../../../../../files/FileProvider.js';
import FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import VirtualFile from '../../../../../files/VirtualFile.js';
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
  ) {
    super(userProvider, fileProvider, mediaImageCache, ['clearlogo', 'logo']);
  }

  protected get imageType(): ImageType {
    return 'logo';
  }

  protected get supportedFormats() {
    return ['png', 'avif'] as const satisfies ImageFormat[];
  }

  protected async processImageFile(imageFile: VirtualFile, format: MediaClearLogoImageProvider['supportedFormats'][number]): Promise<Buffer> {
    let logo = sharp(await imageFile.read())
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
