import Fs from 'node:fs';
import Path from 'node:path';
import { getHttpClient, getPrismaClient } from '../../../Constants';
import IUserFile from '../../../files/IUserFile';
import UserFileHelper from '../../../UserFileHelper';
import VideoAnalyser from '../../video/analyser/VideoAnalyser';
import ExternalTitleMetaDataProvider from '../external_meta_data_provider/ExternalTitleMetaDataProvider';
import Library from '../Library';
import DirectoryAnalyser, { MetaProvider } from './analyser/DirectoryAnalyser';
import MediaLibraryAnalyser from './analyser/MediaLibraryAnalyser';

export default class LibraryScanner {
  private readonly mediaLibraryAnalyser = new MediaLibraryAnalyser(new DirectoryAnalyser());

  async scanLibrary(library: Library): Promise<void> {
    const libraryScanStart = new Date();

    for (const directory of library.directories) {
      const mediaAnalyses = await this.mediaLibraryAnalyser.analyseLibrary(library);
      for (const mediaAnalysis of mediaAnalyses) {
        const titleRoot = directory.getFileSystem().getFile('/' + Path.relative(directory.getFileSystem().getAbsolutePathOnHost(), mediaAnalysis.rootDirectory)); // FIXME
        const titleId = (await getPrismaClient()!.mediaLibraryMedia.upsert({
          select: {
            id: true
          },
          where: {
            libraryId_directoryPath: {
              libraryId: BigInt(library.id),
              directoryPath: titleRoot.getPath()
            }
          },
          create: {
            libraryId: BigInt(library.id),
            directoryPath: titleRoot.getPath(),
            title: mediaAnalysis.name
          },
          update: {
            title: mediaAnalysis.name
          }
        })).id.toString();

        for (const videoFile of mediaAnalysis.videoFiles) {
          const apolloVideoFile = directory.getFileSystem().getFile('/' + Path.relative(directory.getFileSystem().getAbsolutePathOnHost(), videoFile.filePath)); // FIXME

          const fileMimeType = await apolloVideoFile.getMimeType();
          if (fileMimeType == null || !fileMimeType.startsWith('video/')) {
            console.warn(`File '${videoFile.filePath}' is not a video file: ${fileMimeType}`);
            continue;
          }

          const videoAnalysis = await VideoAnalyser.analyze(videoFile.filePath, true);
          const mediaTitle = this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'title') ?? videoFile.title;
          const durationInSeconds = parseInt(videoAnalysis.file.duration, 10);

          await getPrismaClient()!.mediaLibraryMediaItem.upsert({
            where: {
              mediaId_filePath: {
                mediaId: BigInt(titleId),
                filePath: apolloVideoFile.getPath()
              }
            },
            create: {
              mediaId: BigInt(titleId),
              filePath: apolloVideoFile.getPath(),
              title: mediaTitle ?? Path.basename(videoFile.filePath, Path.extname(videoFile.filePath)),
              seasonNumber: videoFile.tvShow?.season ?? null,
              episodeNumber: videoFile.tvShow?.episode ?? null,
              lastScannedAt: libraryScanStart,
              addedAt: new Date(),
              durationInSec: durationInSeconds
            },
            update: {
              title: mediaTitle ?? Path.basename(videoFile.filePath, Path.extname(videoFile.filePath)),
              seasonNumber: videoFile.tvShow?.season ?? null,
              episodeNumber: videoFile.tvShow?.episode ?? null,
              lastScannedAt: new Date(),
              durationInSec: durationInSeconds
            }
          });
        }

        await this.fetchExternalTitleMetaDataIfNeeded(library.id, titleId, titleRoot, mediaAnalysis.metaProviders);
      }

      await getPrismaClient()!.mediaLibraryMediaItem.deleteMany({
        where: {
          mediaId: BigInt(library.id),
          filePath: {
            startsWith: Path.join(directory.getPath(), '/')
          },
          lastScannedAt: {
            lt: libraryScanStart
          }
        }
      });
    }

    await getPrismaClient()!.mediaLibraryMediaItem.deleteMany({
      where: {
        media: {
          libraryId: BigInt(library.id)
        },
        lastScannedAt: {
          lt: libraryScanStart
        }
      }
    });
    await getPrismaClient()!.mediaLibraryMedia.deleteMany({
      where: {
        libraryId: BigInt(library.id),
        items: {
          none: {}
        }
      }
    });
  }

  private async fetchExternalTitleMetaDataIfNeeded(libraryId: string, titleId: string, titleRoot: IUserFile, metaProvider: MetaProvider[]): Promise<void> {
    const existingMedia = await getPrismaClient()!.mediaLibraryMedia.findUnique({
      select: {
        synopsis: true
      },
      where: {
        id: BigInt(titleId)
      }
    });

    const titleHasSynopsisSaved = existingMedia?.synopsis != null;
    const titleHasPosterSaved = (await UserFileHelper.findFolderPoster(titleRoot)) != null;
    if (titleHasSynopsisSaved && titleHasPosterSaved) {
      return;
    }

    const externalMetaData = await new ExternalTitleMetaDataProvider().fetchMetaData(metaProvider);
    if (externalMetaData == null) {
      return;
    }

    if (!titleHasSynopsisSaved && externalMetaData.synopsis) {
      await getPrismaClient()!.mediaLibraryMedia.update({
        where: {
          id: BigInt(titleId)
        },
        data: {
          synopsis: externalMetaData.synopsis
        }
      });
    }

    if (!titleHasPosterSaved && externalMetaData.coverImageUrl) {
      const posterUrl = externalMetaData.coverImageUrl;
      const targetPosterFile = titleRoot.getFileSystem().getFile(Path.join(titleRoot.getPath(), 'folder.png'));

      const coverResponse = await getHttpClient().get(posterUrl);
      if (!coverResponse.ok) {
        console.error(`Failed to download cover image from '${posterUrl}': ${coverResponse.status} ${coverResponse.body.toString('utf-8')}`);
      }

      await Fs.promises.writeFile(targetPosterFile.getAbsolutePathOnHost()! /* FIXME */, coverResponse.body);
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
