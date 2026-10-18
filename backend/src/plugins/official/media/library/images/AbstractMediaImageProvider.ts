import { TimeUnit } from '@spraxdev/node-commons/util';
import type { CachedValue } from '../../../../../cache/CacheEntry.js';
import type { CacheGetOrCreateOptions } from '../../../../../cache/CacheFactory.js';
import type DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaFallbackImageType } from '../../../../../database/prisma-client/enums.js';
import PermissionAwareFileProvider from '../../../../../files/provider/PermissionAwareFileProvider.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import type ApolloUser from '../../../../../user/ApolloUser.js';
import type UserProvider from '../../../../../user/UserProvider.js';
import FullLibraryMedia from '../database/media/FullLibraryMedia.js';
import FallbackImageMissingError from './error/FallbackImageMissingError.js';
import ImageFormatNotSupportedError from './error/ImageFormatNotSupportedError.js';
import { MediaFallbackImageCache } from './MediaFallbackImageCache.js';
import type { MediaImageCache } from './MediaImageCache.js';

export type ImageType = 'poster' | 'backdrop' | 'logo';
export type ImageFormat = 'jpeg' | 'png' | 'avif';

type CachedImageLookup = (format: ImageFormat, factory: () => Promise<Buffer>, options: CacheGetOrCreateOptions) => Promise<CachedValue<Buffer>>;

export default abstract class AbstractMediaImageProvider {
  private readonly fileNamePatterns: RegExp[];

  protected constructor(
    private readonly userProvider: UserProvider,
    private readonly fileProvider: PermissionAwareFileProvider,
    private readonly mediaImageCache: MediaImageCache,
    private readonly mediaFallbackImageCache: MediaFallbackImageCache,
    private readonly databaseClient: DatabaseClient,
    baseFileNamesInPrioritySort: string[],
  ) {
    this.fileNamePatterns = baseFileNamesInPrioritySort.map(fileName => {
      if (!/^[a-z]+$/.test(fileName)) {
        throw new Error('file name patterns need to be RegExp safe');
      }

      return new RegExp(`^${fileName}\.(?:jpg|jpeg|png|webp|avif|tiff)$`, 'i');
    });
  }

  protected abstract get imageType(): ImageType;

  protected abstract get databaseImageType(): MediaLibraryMediaFallbackImageType;

  /** For browsers without AVIF support */
  protected abstract get fallbackFormat(): Exclude<ImageFormat, 'avif'>;

  /** Otherwise {@link encodeFallbackFormat} gets the original image */
  protected get derivesFallbackFormatFromAvif(): boolean {
    return true;
  }

  protected abstract encodeAvif(imageBytes: Buffer): Promise<Buffer>;

  protected abstract encodeFallbackFormat(imageBytes: Buffer): Promise<Buffer>;

  protected generatedFallback(_media: FullLibraryMedia, _format: ImageFormat): Promise<CachedValue<Buffer> | null> {
    return Promise.resolve(null);
  }

  /**
   * @throws ImageFormatNotSupported
   */
  async provide(media: FullLibraryMedia, format: ImageFormat): Promise<CachedValue<Buffer> | null> {
    if (format !== 'avif' && format !== this.fallbackFormat) {
      throw new ImageFormatNotSupportedError(`The format '${format}' is not supported for image type '${this.imageType}'`);
    }

    const imageFile = await this.findImageFileInDirectory(media);
    if (imageFile != null) {
      return this.provideCached(
        (entryFormat, factory, options) => this.mediaImageCache.getOrCreate(imageFile, `${this.imageType}.${entryFormat}`, factory, options),
        format,
        () => imageFile.read(),
      );
    }

    return await this.provideFallbackFromDatabase(media, format) ?? this.generatedFallback(media, format);
  }

  protected provideCached(lookup: CachedImageLookup, format: ImageFormat, readOriginal: () => Promise<Buffer>): Promise<CachedValue<Buffer>> {
    const provideAvif = () => lookup('avif', async () => this.encodeAvif(await readOriginal()), { contentType: 'image/avif' });
    if (format === 'avif') {
      return provideAvif();
    }

    return lookup(
      format,
      async () => this.encodeFallbackFormat(this.derivesFallbackFormatFromAvif ? await this.readAvif(provideAvif) : await readOriginal()),
      {
        contentType: `image/${format}`,
        expiry: { freshMs: TimeUnit.DAYS.toMillis(30) },
      },
    );
  }

  protected async findImageFileInDirectory(media: FullLibraryMedia): Promise<VirtualFile | null> {
    const mediaDirectory = await this.findMediaDirectory(media);
    if (!(await mediaDirectory.isDirectory())) {
      return null;
    }

    const fullFileList = await mediaDirectory.getFiles();
    for (const fileNamePattern of this.fileNamePatterns) {
      for (const file of fullFileList) {
        if (fileNamePattern.test(file.getFileName()) && (await file.isFile())) {
          return file;
        }
      }
    }

    return null;
  }

  private async readAvif(provideAvif: () => Promise<CachedValue<Buffer>>): Promise<Buffer> {
    const avifImage = await provideAvif();
    return avifImage.value();
  }

  private async provideFallbackFromDatabase(media: FullLibraryMedia, format: ImageFormat): Promise<CachedValue<Buffer> | null> {
    if (!(await this.hasFallbackImageInDatabase(media))) {
      return null;
    }

    const cache = this.mediaFallbackImageCache.forUser(await this.findMediaOwner(media));
    try {
      return await this.provideCached(
        (entryFormat, factory, options) => cache.getOrCreate(
          MediaFallbackImageCache.toEntryKey(media.id, `${this.imageType}.${entryFormat}`),
          factory,
          { ...options, groupKey: MediaFallbackImageCache.toGroupKey(media.id) },
        ),
        format,
        () => this.fetchFallbackImageFromDatabase(media),
      );
    } catch (err) {
      if (err instanceof FallbackImageMissingError) {
        return null;
      }
      throw err;
    }
  }

  private async hasFallbackImageInDatabase(media: FullLibraryMedia): Promise<boolean> {
    const imageCount = await this.databaseClient.mediaLibraryMediaFallbackImages.count({
      where: { mediaId: media.id, type: this.databaseImageType },
    });
    return imageCount > 0;
  }

  private async fetchFallbackImageFromDatabase(media: FullLibraryMedia): Promise<Buffer> {
    const fallbackImage = await this.databaseClient.mediaLibraryMediaFallbackImages.findUnique({
      where: {
        mediaId_type: {
          mediaId: media.id,
          type: this.databaseImageType,
        },
      },
      select: { image: true },
    });
    if (fallbackImage == null) {
      throw new FallbackImageMissingError(`The ${this.databaseImageType} fallback image of media ${media.id} was deleted while being processed`);
    }
    return Buffer.from(fallbackImage.image);
  }

  private async findMediaDirectory(media: FullLibraryMedia): Promise<VirtualFile> {
    return this.fileProvider.provideForRead(media.directoryUri, await this.findMediaOwner(media));
  }

  private async findMediaOwner(media: FullLibraryMedia): Promise<ApolloUser> {
    const mediaOwner = await this.userProvider.findById(media.libraryOwnerId);
    if (mediaOwner == null) {
      throw new Error(`Unable to resolve ApolloUser with ID ${JSON.stringify(media.libraryOwnerId)}`);
    }
    return mediaOwner;
  }
}
