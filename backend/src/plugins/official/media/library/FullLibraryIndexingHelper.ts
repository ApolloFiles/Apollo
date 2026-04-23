import { singleton } from 'tsyringe';
import type ApolloUser from '../../../../user/ApolloUser.js';
import UserProvider from '../../../../user/UserProvider.js';
import MediaLibraryByUserFinder from './database/library/MediaLibraryByUserFinder.js';
import ReadContentsLibrary from './database/library/ReadContentsLibrary.js';
import MediaLibraryMediaFinder from './database/media/MediaLibraryMediaFinder.js';
import MediaLibraryMediaItemFinder from './database/media-item/MediaLibraryMediaItemFinder.js';
import LibraryMetadataHydrator from './hydrator/LibraryMetadataHydrator.js';
import MediaBackdropImageProvider from './images/MediaBackdropImageProvider.js';
import MediaClearLogoImageProvider from './images/MediaClearLogoImageProvider.js';
import MediaPosterImageProvider from './images/MediaPosterImageProvider.js';
import MediaLibraryScanner from './scanner/MediaLibraryScanner.js';
import VideoThumbnailProvider from './thumbnail/VideoThumbnailProvider.js';

@singleton()
export default class FullLibraryIndexingHelper {
  private readonly activeScansByUserId: string[] = [];

  constructor(
    private readonly userProvider: UserProvider,
    private readonly mediaLibraryByUserFinder: MediaLibraryByUserFinder,
    private readonly mediaLibraryScanner: MediaLibraryScanner,
    private readonly mediaLibraryHydrator: LibraryMetadataHydrator,
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
    private readonly mediaLibraryMediaItemFinder: MediaLibraryMediaItemFinder,
    private readonly mediaPosterImageProvider: MediaPosterImageProvider,
    private readonly mediaClearLogoImageProvider: MediaClearLogoImageProvider,
    private readonly mediaBackdropImageProvider: MediaBackdropImageProvider,
    private readonly videoThumbnailProvider: VideoThumbnailProvider,
  ) {
  }

  async runForAllUsers(): Promise<void> {
    console.time('FullLibraryIndexingHelper#runForAllUsers');

    try {
      const users = await this.userProvider.findAll();
      for (const user of users) {
        await this.runForUser(user);
      }
    } finally {
      console.timeEnd('FullLibraryIndexingHelper#runForAllUsers');
    }
  }

  async runForUser(user: ApolloUser): Promise<void> {
    this.activeScansByUserId.push(user.id);

    try {
      const libraries = await this.mediaLibraryByUserFinder.findOwnedFull(user.id);

      for (const library of libraries) {
        try {
          await this.mediaLibraryScanner.scan(library);
          console.debug(`[MediaLibraryIndexer] Scanned for media in {id=${library.id},name=${JSON.stringify(library.name)},owner=${JSON.stringify(user.displayName)}}`);
        } catch (err) {
          console.error(err);
        }
      }

      for (const library of libraries) {
        try {
          const totalHydrated = await this.mediaLibraryHydrator.hydrateNeeded(library);
          console.debug(`[MediaLibraryIndexer] Hydrated ${totalHydrated} media in {id=${library.id},name=${JSON.stringify(library.name)},owner=${JSON.stringify(user.displayName)}}`);
        } catch (err) {
          console.error(err);
        }
      }

      for (const library of libraries) {
        try {
          await this.preGenerateImagesForLibrary(library);
          console.debug(`[MediaLibraryIndexer] Pre-generated important images for {id=${library.id},name=${JSON.stringify(library.name)},owner=${JSON.stringify(user.displayName)}}`);
        } catch (err) {
          console.error(err);
        }
      }
    } finally {
      const indexOfUserId = this.activeScansByUserId.indexOf(user.id);
      if (indexOfUserId === -1) {
        //noinspection ThrowInsideFinallyBlockJS
        throw new Error('Inconsistent state: user id not found in active scans list');
      }

      this.activeScansByUserId.splice(indexOfUserId, 1);
    }
  }

  isIndexingRunningForUser(user: ApolloUser): boolean {
    return this.activeScansByUserId.includes(user.id);
  }

  private async preGenerateImagesForLibrary(library: ReadContentsLibrary): Promise<void> {
    const allMedia = await this.mediaLibraryMediaFinder.findFullByLibraryId(library.id);
    for (const media of allMedia) {
      await Promise.allSettled([
        this.mediaPosterImageProvider.provide(media, 'avif'),
        this.mediaClearLogoImageProvider.provide(media, 'avif'),
        this.mediaBackdropImageProvider.provide(media, 'avif'),
      ]);
    }

    for (const media of allMedia) {
      const mediaItems = await this.mediaLibraryMediaItemFinder.findFullByMediaId(media.id);
      for (const mediaItem of mediaItems) {
        try {
          await this.videoThumbnailProvider.provide(mediaItem, 'avif');
        } catch (err) {
          console.error(err);
        }
      }
    }
  }
}
