import type FileSystemProvider from '../../../../../files/FileSystemProvider.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import type UserProvider from '../../../../../user/UserProvider.js';
import type MediaLibraryMedia from '../database/MediaLibraryMedia.js';
import type MediaImageCache from './MediaImageCache.js';

export type ImageType = 'poster' | 'backdrop';
export type ImageFormat = 'jpeg' | 'avif';

export default abstract class AbstractMediaImageProvider {
  private readonly fileNamePatterns: RegExp[];

  protected constructor(
    private readonly userProvider: UserProvider,
    private readonly fileSystemProvider: FileSystemProvider,
    private readonly mediaImageCache: MediaImageCache,
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

  protected abstract processImageFile(imageFile: VirtualFile, format: ImageFormat): Promise<Buffer>;

  protected abstract generatedFallback(media: MediaLibraryMedia, format: ImageFormat): Promise<Buffer | null>;

  async provide(media: MediaLibraryMedia, format: ImageFormat): Promise<Buffer | null> {
    const imageFile = await this.findImageFileInDirectory(media);
    if (imageFile == null) {
      return this.generatedFallback(media, format);
    }

    let imageData = await this.mediaImageCache.get(imageFile, this.imageType, format);

    if (imageData == null) {
      imageData = await this.processImageFile(imageFile, format);
      await this.mediaImageCache.write(imageFile, this.imageType, format, imageData);
    }

    return imageData;
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

  private async findMediaDirectory(media: MediaLibraryMedia): Promise<VirtualFile> {
    const mediaOwner = await this.userProvider.provideByAuthId(media.libraryOwnerId);
    if (mediaOwner == null) {
      throw new Error(`Unable to resolve ApolloUser with ID ${JSON.stringify(media.libraryOwnerId)}`);
    }

    const fileSystems = await this.getOwnerFileSystems(media);
    return fileSystems.user[0].getFile(media.directoryPath);
  }

  private async getOwnerFileSystems(media: MediaLibraryMedia) {
    const mediaOwner = await this.userProvider.provideByAuthId(media.libraryOwnerId);
    if (mediaOwner == null) {
      throw new Error(`Unable to resolve ApolloUser with ID ${JSON.stringify(media.libraryOwnerId)}`);
    }

    return await this.fileSystemProvider.provideForUser(mediaOwner);
  }
}
