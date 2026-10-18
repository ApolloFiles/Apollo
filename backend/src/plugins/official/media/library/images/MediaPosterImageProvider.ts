import Crypto from 'node:crypto';
import sharp from 'sharp';
import { singleton } from 'tsyringe';
import type { CachedValue } from '../../../../../cache/CacheEntry.js';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaFallbackImageType } from '../../../../../database/prisma-client/enums.js';
import PermissionAwareFileProvider from '../../../../../files/provider/PermissionAwareFileProvider.js';
import UserProvider from '../../../../../user/UserProvider.js';
import FullLibraryMedia from '../database/media/FullLibraryMedia.js';
import AbstractMediaImageProvider, { type ImageFormat, type ImageType } from './AbstractMediaImageProvider.js';
import FallbackMediaPosterGenerator from './FallbackMediaPosterGenerator.js';
import { GeneratedMediaPosterCache } from './GeneratedMediaPosterCache.js';
import ImageFileConstants from './ImageFileConstants.js';
import { MediaFallbackImageCache } from './MediaFallbackImageCache.js';
import { MediaImageCache } from './MediaImageCache.js';

@singleton()
export default class MediaPosterImageProvider extends AbstractMediaImageProvider {
  private static readonly MAX_POSTER_WIDTH = 1000;
  private static readonly MAX_POSTER_HEIGHT = 1500; // 2:3 aspect ratio

  constructor(
    userProvider: UserProvider,
    fileProvider: PermissionAwareFileProvider,
    mediaImageCache: MediaImageCache,
    mediaFallbackImageCache: MediaFallbackImageCache,
    databaseClient: DatabaseClient,
    private readonly fallbackPosterGenerator: FallbackMediaPosterGenerator,
    private readonly generatedPosterCache: GeneratedMediaPosterCache,
  ) {
    super(userProvider, fileProvider, mediaImageCache, mediaFallbackImageCache, databaseClient, ['poster', 'folder', 'cover']);
  }

  protected get imageType(): ImageType {
    return 'poster';
  }

  protected get databaseImageType(): MediaLibraryMediaFallbackImageType {
    return 'POSTER';
  }

  protected get fallbackFormat() {
    return 'jpeg' as const;
  }

  protected encodeAvif(imageBytes: Buffer): Promise<Buffer> {
    return sharp(imageBytes)
      .resize({
        width: MediaPosterImageProvider.MAX_POSTER_WIDTH,
        height: MediaPosterImageProvider.MAX_POSTER_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .avif(ImageFileConstants.POSTER_OPTIONS_AVIF)
      .toBuffer();
  }

  protected encodeFallbackFormat(imageBytes: Buffer): Promise<Buffer> {
    return sharp(imageBytes)
      .jpeg(ImageFileConstants.POSTER_OPTIONS_JPEG)
      .toBuffer();
  }

  protected override generatedFallback(media: FullLibraryMedia, format: ImageFormat): Promise<CachedValue<Buffer>> {
    const mediaTitleHash = Crypto.createHash('sha256').update(media.title).digest('hex');
    return this.provideCached(
      (entryFormat, factory, options) => this.generatedPosterCache.getOrCreate(`${mediaTitleHash}.${entryFormat}`, factory, options),
      format,
      () => this.fallbackPosterGenerator.generatePoster(media.title),
    );
  }
}
