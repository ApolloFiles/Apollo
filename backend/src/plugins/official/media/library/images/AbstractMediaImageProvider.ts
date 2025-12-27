import type DatabaseClient from '../../../../../database/DatabaseClient.js';
import type { MediaLibraryMediaFallbackImageType } from '../../../../../database/prisma-client/enums.js';
import type FileProvider from '../../../../../files/FileProvider.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import type UserProvider from '../../../../../user/UserProvider.js';
import type MediaLibraryMedia from '../database/MediaLibraryMedia.js';
import ImageFormatNotSupportedError from './error/ImageFormatNotSupportedError.js';
import type MediaImageCache from './MediaImageCache.js';

export type ImageType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
export type ImageFormat = 'jpeg' | 'png' | 'avif';

export default abstract class AbstractMediaImageProvider {
  private readonly fileNamePatterns: RegExp[];

  protected constructor(
    private readonly userProvider: UserProvider,
    private readonly fileProvider: FileProvider,
    private readonly mediaImageCache: MediaImageCache,
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

  protected abstract get databaseImageType(): MediaLibraryMediaFallbackImageType | null;

  protected abstract get supportedFormats(): ImageFormat[];

  protected abstract processImageBytes(imageBytes: Buffer, format: AbstractMediaImageProvider['supportedFormats'][number]): Promise<Buffer>;

  protected abstract generatedFallback(media: MediaLibraryMedia, format: ImageFormat): Promise<Buffer | null>;

  /**
   * @throws ImageFormatNotSupported
   */
  async provide(media: MediaLibraryMedia, format: ImageFormat): Promise<Buffer | null> {
    if (!this.supportedFormats.includes(format)) {
      throw new ImageFormatNotSupportedError(`The format '${format}' is not supported for image type '${this.imageType}'`);
    }

    const imageFile = await this.findImageFileInDirectory(media);
    if (imageFile == null) {
      const fallbackFromDatabase = await this.provideFallbackFromDatabase(media, format);
      if (fallbackFromDatabase != null) {
        return fallbackFromDatabase;
      }

      return this.generatedFallback(media, format);
    }

    let imageData = await this.mediaImageCache.get(imageFile, this.imageType, format);

    if (imageData == null) {
      imageData = await this.processImageFile(imageFile, format);
      await this.mediaImageCache.write(imageFile, this.imageType, format, imageData);
    }

    return imageData;
  }

  protected async processImageFile(imageFile: VirtualFile, format: AbstractMediaImageProvider['supportedFormats'][number]): Promise<Buffer> {
    return this.processImageBytes(await imageFile.read(), format);
  }

  protected async findImageFileInDirectory(media: MediaLibraryMedia): Promise<VirtualFile | null> {
    const mediaDirectory = await this.findMediaDirectory(media);
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

  // TODO: Add caching
  private async provideFallbackFromDatabase(media: MediaLibraryMedia, format: AbstractMediaImageProvider['supportedFormats'][number]): Promise<Buffer | null> {
    if (this.databaseImageType == null) {
      return null;
    }

    const rawFallbackImage = await this.databaseClient.mediaLibraryMediaFallbackImages.findUnique({
      where: {
        mediaId_type: {
          mediaId: media.id,
          type: this.databaseImageType,
        },
      },
      select: { image: true },
    });

    if (rawFallbackImage != null) {
      return this.processImageBytes(Buffer.from(rawFallbackImage.image), format);
    }
    return null;
  }

  private async findMediaDirectory(media: MediaLibraryMedia): Promise<VirtualFile> {
    const mediaOwner = await this.userProvider.provideByAuthId(media.libraryOwnerId);
    if (mediaOwner == null) {
      throw new Error(`Unable to resolve ApolloUser with ID ${JSON.stringify(media.libraryOwnerId)}`);
    }

    return this.fileProvider.provideForUserByUri(mediaOwner, media.directoryUri);
  }
}
