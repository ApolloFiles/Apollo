import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import sharp from 'sharp';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../../../../../config/ApolloDirectoryProvider.js';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaFallbackImageType } from '../../../../../database/prisma-client/enums.js';
import FileProvider from '../../../../../files/FileProvider.js';
import UserProvider from '../../../../../user/UserProvider.js';
import type MediaLibraryMedia from '../database/MediaLibraryMedia.js';
import AbstractMediaImageProvider, { type ImageFormat, type ImageType } from './AbstractMediaImageProvider.js';
import FallbackMediaPosterGenerator from './FallbackMediaPosterGenerator.js';
import ImageFileConstants from './ImageFileConstants.js';
import MediaImageCache from './MediaImageCache.js';

@singleton()
export default class MediaPosterImageProvider extends AbstractMediaImageProvider {
  private static readonly MAX_POSTER_WIDTH = 1000;
  private static readonly MAX_POSTER_HEIGHT = 1500; // 2:3 aspect ratio

  constructor(
    userProvider: UserProvider,
    fileProvider: FileProvider,
    mediaImageCache: MediaImageCache,
    databaseClient: DatabaseClient,
    private readonly fallbackPosterGenerator: FallbackMediaPosterGenerator,
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
    super(userProvider, fileProvider, mediaImageCache, databaseClient, ['poster', 'folder', 'cover']);
  }

  protected get imageType(): ImageType {
    return 'poster';
  }

  protected get databaseImageType(): MediaLibraryMediaFallbackImageType | null {
    return 'POSTER';
  }

  protected get supportedFormats() {
    return ['jpeg', 'avif'] as const satisfies ImageFormat[];
  }

  protected processImageBytes(imageBytes: Buffer, format: MediaPosterImageProvider['supportedFormats'][number]): Promise<Buffer> {
    let poster = sharp(imageBytes)
      .resize({
        width: MediaPosterImageProvider.MAX_POSTER_WIDTH,
        height: MediaPosterImageProvider.MAX_POSTER_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 0, g: 0, b: 0 } });

    if (format === 'avif') {
      poster = poster.avif(ImageFileConstants.POSTER_OPTIONS_AVIF);
    } else {
      poster = poster.jpeg(ImageFileConstants.POSTER_OPTIONS_JPEG);
    }

    return poster.toBuffer();
  }

  protected async generatedFallback(media: MediaLibraryMedia, format: 'jpeg' | 'avif'): Promise<Buffer> {
    const mediaTitleHash = Crypto.createHash('sha256').update(media.title).digest('hex');

    const tmpDir = Path.join(this.apolloDirectoryProvider.getAppTemporaryDirectory(), 'apollo_media', 'fallback-posters');
    const tmpFile = Path.join(tmpDir, `${mediaTitleHash}.${format}`);

    if (Fs.existsSync(tmpFile)) {
      return Fs.promises.readFile(tmpFile);
    }

    const fileData = await this.fallbackPosterGenerator.generatePoster(media.title, format);

    await Fs.promises.mkdir(tmpDir, { recursive: true });
    await Fs.promises.writeFile(tmpFile, fileData);

    return fileData;
  }
}
