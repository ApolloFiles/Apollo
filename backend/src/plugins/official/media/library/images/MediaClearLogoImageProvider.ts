import Sharp, { type Sharp as SharpInstance } from 'sharp';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaFallbackImageType } from '../../../../../database/prisma-client/enums.js';
import PermissionAwareFileProvider from '../../../../../files/provider/PermissionAwareFileProvider.js';
import UserProvider from '../../../../../user/UserProvider.js';
import AbstractMediaImageProvider, { type ImageType } from './AbstractMediaImageProvider.js';
import ImageFileConstants from './ImageFileConstants.js';
import { MediaFallbackImageCache } from './MediaFallbackImageCache.js';
import { MediaImageCache } from './MediaImageCache.js';

@singleton()
export default class MediaClearLogoImageProvider extends AbstractMediaImageProvider {
  private static readonly MAX_LOGO_HEIGHT = 500;

  constructor(
    userProvider: UserProvider,
    fileProvider: PermissionAwareFileProvider,
    mediaImageCache: MediaImageCache,
    mediaFallbackImageCache: MediaFallbackImageCache,
    databaseClient: DatabaseClient,
  ) {
    super(userProvider, fileProvider, mediaImageCache, mediaFallbackImageCache, databaseClient, ['clearlogo', 'logo']);
  }

  protected get imageType(): ImageType {
    return 'logo';
  }

  protected get databaseImageType(): MediaLibraryMediaFallbackImageType {
    return 'LOGO';
  }

  protected get fallbackFormat() {
    return 'png' as const;
  }

  // A PNG of the lossy AVIF would carry its artifacts at the transparent edges
  protected override get derivesFallbackFormatFromAvif(): boolean {
    return false;
  }

  protected encodeAvif(imageBytes: Buffer): Promise<Buffer> {
    return this.resize(imageBytes)
      .avif(ImageFileConstants.LOGO_OPTIONS_AVIF)
      .toBuffer();
  }

  protected encodeFallbackFormat(imageBytes: Buffer): Promise<Buffer> {
    return this.resize(imageBytes)
      .png(ImageFileConstants.LOGO_OPTIONS_PNG)
      .toBuffer();
  }

  private resize(imageBytes: Buffer): SharpInstance {
    return Sharp(imageBytes)
      .resize({
        height: MediaClearLogoImageProvider.MAX_LOGO_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      });
  }
}
