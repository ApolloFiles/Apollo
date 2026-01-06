import { singleton } from 'tsyringe';
import type ApolloUser from '../../../../user/ApolloUser.js';
import UserProvider from '../../../../user/UserProvider.js';
import MediaLibraryFinder from './database/finder/MediaLibraryFinder.js';
import MediaLibraryMediaFinder from './database/finder/MediaLibraryMediaFinder.js';
import type MediaLibrary from './database/MediaLibrary.js';
import LibraryMetadataHydrator from './hydrator/LibraryMetadataHydrator.js';
import MediaBackdropImageProvider from './images/MediaBackdropImageProvider.js';
import MediaClearLogoImageProvider from './images/MediaClearLogoImageProvider.js';
import MediaPosterImageProvider from './images/MediaPosterImageProvider.js';
import MediaLibraryScanner from './scanner/MediaLibraryScanner.js';

@singleton()
export default class FullLibraryIndexingHelper {
  private readonly activeScansByUserId: string[] = [];

  constructor(
    private readonly userProvider: UserProvider,
    private readonly mediaLibraryFinder: MediaLibraryFinder,
    private readonly mediaLibraryScanner: MediaLibraryScanner,
    private readonly mediaLibraryHydrator: LibraryMetadataHydrator,
    private readonly mediaLibraryMediaFinder: MediaLibraryMediaFinder,
    private readonly mediaPosterImageProvider: MediaPosterImageProvider,
    private readonly mediaClearLogoImageProvider: MediaClearLogoImageProvider,
    private readonly mediaBackdropImageProvider: MediaBackdropImageProvider,
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
      const libraries = await this.mediaLibraryFinder.findOwnedByUser(user);

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

  private async preGenerateImagesForLibrary(library: MediaLibrary): Promise<void> {
    const allMedia = await this.mediaLibraryMediaFinder.findByLibraryId(library.id);
    for (const media of allMedia) {
      await Promise.allSettled([
        this.mediaPosterImageProvider.provide(media, 'avif'),
        this.mediaClearLogoImageProvider.provide(media, 'avif'),
        this.mediaBackdropImageProvider.provide(media, 'avif'),
      ]);
    }
  }
}
