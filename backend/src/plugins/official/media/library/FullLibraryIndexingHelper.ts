import { singleton } from 'tsyringe';
import type ApolloUser from '../../../../user/ApolloUser.js';
import UserProvider from '../../../../user/UserProvider.js';
import MediaLibraryFinder from './database/finder/MediaLibraryFinder.js';
import LibraryMetadataHydrator from './hydrator/LibraryMetadataHydrator.js';
import MediaLibraryScanner from './scanner/MediaLibraryScanner.js';

@singleton()
export default class FullLibraryIndexingHelper {
  constructor(
    private readonly userProvider: UserProvider,
    private readonly mediaLibraryFinder: MediaLibraryFinder,
    private readonly mediaLibraryScanner: MediaLibraryScanner,
    private readonly mediaLibraryHydrator: LibraryMetadataHydrator,
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
  }
}
