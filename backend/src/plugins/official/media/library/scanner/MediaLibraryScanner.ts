import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../database/DatabaseClient.js';
import FileProvider from '../../../../../files/FileProvider.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import ApolloFileURI from '../../../../../url/ApolloFileURI.js';
import UserProvider from '../../../../../user/UserProvider.js';
import MediaLibrary from '../database/MediaLibrary.js';
import MediaDirectoryDetector from './MediaDirectoryDetector.js';
import MediaLibraryMediaWriter from './MediaLibraryMediaWriter.js';
import MovieDirectoryScanner from './MovieDirectoryScanner.js';
import TvShowDirectoryScanner from './TvShowDirectoryScanner.js';

@singleton()
export default class MediaLibraryScanner {
  constructor(
    private readonly userProvider: UserProvider,
    private readonly fileProvider: FileProvider,
    private readonly databaseClient: DatabaseClient,
    private readonly mediaDirectoryDetector: MediaDirectoryDetector,
    private readonly tvShowDirectoryScanner: TvShowDirectoryScanner,
    private readonly movieDirectoryScanner: MovieDirectoryScanner,
  ) {
  }

  async scan(library: MediaLibrary): Promise<void> {
    const libraryOwner = await this.userProvider.provideByAuthId(library.ownerId);
    if (libraryOwner == null) {
      throw new Error(`Library owner with id '${library.ownerId}' not found`);
    }

    const mediaWriter = new MediaLibraryMediaWriter(this.databaseClient);

    for (const directoryUri of library.directoryUris) {
      const directory = await this.fileProvider.provideForUserByUri(libraryOwner, ApolloFileURI.parse(directoryUri));
      if (!(await directory.isDirectory())) {
        continue;
      }

      await this.scanDirectory(library, directory, mediaWriter);
    }

    await mediaWriter.deleteOldMediaItems(library.id);
  }

  private async scanDirectory(library: MediaLibrary, directory: VirtualFile, writer: MediaLibraryMediaWriter): Promise<void> {
    for (const file of (await directory.getFiles())) {
      const fileStat = await file.stat();

      if (fileStat.isDirectory()) {
        const detectedType = await this.mediaDirectoryDetector.detect(file);

        if (detectedType == null) {
          await this.scanDirectory(library, file, writer);
        } else if (detectedType === 'tv') {
          try {
            await this.tvShowDirectoryScanner.scan(library, file, writer);
          } catch (err) {
            console.error(err);
          }
        } else if (detectedType === 'movie') {
          try {
            await this.movieDirectoryScanner.scan(library, file, writer);
          } catch (err) {
            console.error(err);
          }
        } else {
          throw new Error(`Unhandled detected media directory type: '${detectedType}'`);
        }
      }
    }
  }
}
