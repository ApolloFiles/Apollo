import Sharp from 'sharp';
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
export default class MediaBackdropImageProvider extends AbstractMediaImageProvider {
  private static readonly MAX_BACKDROP_WIDTH = 2560;
  private static readonly MAX_BACKDROP_HEIGHT = 1440; // 16:9 aspect ratio

  constructor(
    userProvider: UserProvider,
    fileProvider: PermissionAwareFileProvider,
    mediaImageCache: MediaImageCache,
    mediaFallbackImageCache: MediaFallbackImageCache,
    databaseClient: DatabaseClient,
  ) {
    super(userProvider, fileProvider, mediaImageCache, mediaFallbackImageCache, databaseClient, ['backdrop', 'background', 'fanart', 'art']);
  }

  protected get imageType(): ImageType {
    return 'backdrop';
  }

  protected get databaseImageType(): MediaLibraryMediaFallbackImageType {
    return 'BACKDROP';
  }

  protected get fallbackFormat() {
    return 'jpeg' as const;
  }

  protected encodeAvif(imageBytes: Buffer): Promise<Buffer> {
    return Sharp(imageBytes)
      .resize({
        width: MediaBackdropImageProvider.MAX_BACKDROP_WIDTH,
        height: MediaBackdropImageProvider.MAX_BACKDROP_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .avif(ImageFileConstants.BACKDROP_OPTIONS_AVIF)
      .toBuffer();
  }

  protected encodeFallbackFormat(imageBytes: Buffer): Promise<Buffer> {
    return Sharp(imageBytes)
      .jpeg(ImageFileConstants.BACKDROP_OPTIONS_JPEG)
      .toBuffer();
  }
}
