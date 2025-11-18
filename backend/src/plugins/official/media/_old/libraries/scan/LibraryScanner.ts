import Path from 'node:path';
import Sharp from 'sharp';
import { singleton } from 'tsyringe';
import DatabaseClient from '../../../../../../database/DatabaseClient.js';
import type LocalFile from '../../../../../../files/local/LocalFile.js';
import UserFileHelper from '../../UserFileHelper.js';
import VideoAnalyser from '../../video/analyser/VideoAnalyser.js';
import ExternalTitleMetaDataProvider from '../external_meta_data_provider/ExternalTitleMetaDataProvider.js';
import type Library from '../Library.js';
import type { MetaProvider } from './analyser/DirectoryAnalyser.js';
import MediaLibraryAnalyser from './analyser/MediaLibraryAnalyser.js';

@singleton()
export default class LibraryScanner {
  constructor(
    private readonly mediaLibraryAnalyser: MediaLibraryAnalyser,
    private readonly databaseClient: DatabaseClient,
  ) {
  }

  async scanLibrary(library: Library): Promise<void> {
    const libraryScanStart = new Date();

    for (const directory of library.directories) {
      const mediaAnalyses = await this.mediaLibraryAnalyser.analyseLibrary(library);
      for (const mediaAnalysis of mediaAnalyses) {
        const titleRoot = await directory.fileSystem.getFile('/' + Path.relative(directory.fileSystem.getAbsolutePathOnHost(), mediaAnalysis.rootDirectory)); // FIXME
        const titleId = (await this.databaseClient.mediaLibraryMedia.upsert({
          select: {
            id: true,
          },
          where: {
            libraryId_directoryPath: {
              libraryId: BigInt(library.id),
              directoryPath: titleRoot.path,
            },
          },
          create: {
            libraryId: BigInt(library.id),
            directoryPath: titleRoot.path,
            title: mediaAnalysis.name,
          },
          update: {
            title: mediaAnalysis.name,
          },
        })).id.toString();

        console.log(`[DEBUG] Scanning title '${mediaAnalysis.name}'...`);

        for (const videoFile of mediaAnalysis.videoFiles) {
          const apolloVideoFile = await directory.fileSystem.getFile('/' + Path.relative(directory.fileSystem.getAbsolutePathOnHost(), videoFile.filePath)); // FIXME

          const videoAnalysis = await VideoAnalyser.analyze(videoFile.filePath, true);
          const mediaTitle = (this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'title-ger') || this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'title-eng') || this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'title')) ?? videoFile.title;
          const mediaSynopsis = this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'synopsis-ger') || this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'synopsis-eng') || this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'synopsis');
          const durationInSeconds = parseInt(videoAnalysis.file.duration ?? '0', 10);

          await this.databaseClient.mediaLibraryMediaItem.upsert({
            where: {
              mediaId_filePath: {
                mediaId: BigInt(titleId),
                filePath: apolloVideoFile.path,
              },
            },
            create: {
              mediaId: BigInt(titleId),
              filePath: apolloVideoFile.path,
              title: mediaTitle ?? Path.basename(videoFile.filePath, Path.extname(videoFile.filePath)),
              seasonNumber: videoFile.tvShow?.season ?? null,
              episodeNumber: videoFile.tvShow?.episode ?? null,
              lastScannedAt: libraryScanStart,
              addedAt: new Date(),
              durationInSec: durationInSeconds,
              synopsis: mediaSynopsis,
            },
            update: {
              title: mediaTitle ?? Path.basename(videoFile.filePath, Path.extname(videoFile.filePath)),
              seasonNumber: videoFile.tvShow?.season ?? null,
              episodeNumber: videoFile.tvShow?.episode ?? null,
              lastScannedAt: new Date(),
              durationInSec: durationInSeconds,
              synopsis: mediaSynopsis,
            },
          });
        }

        await this.fetchExternalTitleMetaDataIfNeeded(library.id, titleId, titleRoot, mediaAnalysis.metaProviders);
      }

      await this.databaseClient.mediaLibraryMediaItem.deleteMany({
        where: {
          mediaId: BigInt(library.id),
          filePath: {
            startsWith: Path.join(directory.path, '/'),
          },
          lastScannedAt: {
            lt: libraryScanStart,
          },
        },
      });
    }

    await this.databaseClient.mediaLibraryMediaItem.deleteMany({
      where: {
        media: {
          libraryId: BigInt(library.id),
        },
        lastScannedAt: {
          lt: libraryScanStart,
        },
      },
    });
    await this.databaseClient.mediaLibraryMedia.deleteMany({
      where: {
        libraryId: BigInt(library.id),
        items: {
          none: {},
        },
      },
    });
  }

  private async fetchExternalTitleMetaDataIfNeeded(libraryId: string, titleId: string, titleRoot: LocalFile, metaProvider: MetaProvider[]): Promise<void> {
    const existingMedia = await this.databaseClient.mediaLibraryMedia.findUnique({
      select: {
        synopsis: true,
      },
      where: {
        id: BigInt(titleId),
      },
    });

    const titleHasSynopsisSaved = existingMedia?.synopsis != null;
    const titleHasPosterSaved = (await UserFileHelper.findFolderPoster(titleRoot)) != null;
    if (titleHasSynopsisSaved && titleHasPosterSaved) {
      return;
    }

    let externalMetaData;
    try {
      externalMetaData = await new ExternalTitleMetaDataProvider().fetchMetaData(metaProvider);
    } catch (err) {
      console.error('Error fetching external meta data:', err);
      return;
    }
    if (externalMetaData == null) {
      return;
    }

    if (!titleHasSynopsisSaved && externalMetaData.synopsis) {
      await this.databaseClient.mediaLibraryMedia.update({
        where: {
          id: BigInt(titleId),
        },
        data: {
          synopsis: externalMetaData.synopsis,
        },
      });
    }

    if (!titleHasPosterSaved && externalMetaData.hasPosterImage) {
      const targetPosterFile = await titleRoot.fileSystem.getFile(Path.join(titleRoot.path, 'folder.jpg'));

      const posterImage = await externalMetaData.fetchPosterImage();
      if (posterImage != null) {
        const posterImageToWrite = await Sharp(posterImage)
          .removeAlpha()
          .resize({
            height: 1500,
            fit: 'contain',
            withoutEnlargement: true,
          })
          .jpeg()
          .toBuffer();

        await titleRoot.fileSystem.acquireLock(null as any, targetPosterFile, (writableFile) => {
          writableFile.write(posterImageToWrite);
        });
      }
    }
  }

  private getValueFromObjectByKeyIgnoreCase(object: { [key: string]: any }, key: Lowercase<string>): string | null {
    for (const objectKey in object) {
      if (objectKey.toLowerCase() === key) {
        return object[objectKey];
      }
    }
    return null;
  }
}
