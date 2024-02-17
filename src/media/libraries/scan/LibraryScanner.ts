import Fs from 'node:fs';
import Path from 'node:path';
import { getHttpClient } from '../../../Constants';
import MediaLibraryTable from '../../../database/postgres/MediaLibraryTable';
import IUserFile from '../../../files/IUserFile';
import UserFileHelper from '../../../UserFileHelper';
import VideoAnalyser from '../../video/analyser/VideoAnalyser';
import ExternalTitleMetaDataProvider from '../external_meta_data_provider/ExternalTitleMetaDataProvider';
import Library from '../Library';

export default class LibraryScanner {
  async scanLibrary(library: Library): Promise<void> {
    const libraryScanStart = new Date();

    for (const directoryToScan of library.directories) {
      const filesInDirectory = await directoryToScan.getFiles();
      for (const file of filesInDirectory) {
        if (!(await file.isDirectory())) {
          continue;
        }

        const mediaTitleDirectoryName = file.getName();
        const parsedMediaTitleDirectoryName = this.parseMediaTitleDirectoryName(mediaTitleDirectoryName);
        const titleId = await MediaLibraryTable.getInstance().updateLibraryTitle(library.id, file.getPath(), parsedMediaTitleDirectoryName.title);

        const titleHasSynopsisSaved = (await MediaLibraryTable.getInstance().getLibraryTitle(library.id, titleId))!.synopsis != null;
        const titleHasPosterSaved = (await UserFileHelper.findFolderPoster(file)) != null;
        if (!titleHasSynopsisSaved || !titleHasPosterSaved) {
          const externalMetaData = await new ExternalTitleMetaDataProvider().fetchMetaData(parsedMediaTitleDirectoryName.externalMetaDataProviders);
          if (externalMetaData != null) {
            if (externalMetaData.synopsis) {
              await MediaLibraryTable.getInstance().updateLibraryTitleMetaData(titleId, externalMetaData.synopsis);
            }

            if (!titleHasPosterSaved && externalMetaData.coverImageUrl) {
              const posterUrl = externalMetaData.coverImageUrl;
              const targetPosterFile = file.getFileSystem().getFile(Path.join(file.getPath(), 'folder.png'));

              const coverResponse = await getHttpClient().get(posterUrl);
              if (!coverResponse.ok) {
                console.error(`Failed to download cover image from '${posterUrl}': ${coverResponse.status} ${coverResponse.body.toString('utf-8')}`);
              }

              await Fs.promises.writeFile(targetPosterFile.getAbsolutePathOnHost()! /* FIXME */, coverResponse.body);
            }
          }
        }

        await this.scanMediaTitleDirectory(library, titleId, file);
        await MediaLibraryTable.getInstance().deleteMediaEntriesWithinDirectoryBeforeLastScannedAt(library.id, file.getPath(), libraryScanStart);
      }
    }

    await MediaLibraryTable.getInstance().deleteMediaEntriesBeforeLastScannedAt(library.id, libraryScanStart);
    await MediaLibraryTable.getInstance().deleteMediaTitlesWithoutMediaEntries(library.id);
  }

  async scanMediaTitleDirectory(library: Library, titleId: string, mediaTitleDirectory: IUserFile): Promise<void> {
    const filesInDirectory = await mediaTitleDirectory.getFiles();
    for (const file of filesInDirectory) {
      if (!(await file.isDirectory())) {
        continue;
      }

      const mediaDirectoryName = file.getName();
      const seasonNumber = this.extractSeasonFromFileName(mediaDirectoryName);
      if (seasonNumber == null) {
        console.log('No season number found for directory: ' + mediaDirectoryName);
        continue;
      }

      await this.scanSeasonDirectory(library, titleId, file, seasonNumber);
    }
  }

  async scanSeasonDirectory(library: Library, titleId: string, seasonDirectory: IUserFile, seasonNumber: number): Promise<void> {
    const filesInDirectory = await seasonDirectory.getFiles();
    for (const file of filesInDirectory) {
      if (!(await file.isFile())) {
        continue;
      }

      const fileMimeType = await file.getMimeType();
      if (fileMimeType == null || !fileMimeType.startsWith('video/')) {
        continue;
      }

      const episodeNumber = this.extractEpisodeFromFileName(file.getName());
      let episodeName = file.getName();
      let durationInSeconds = 0;

      const absolutePathOnHost = file.getAbsolutePathOnHost();
      if (absolutePathOnHost != null) {
        const videoAnalysis = await VideoAnalyser.analyze(absolutePathOnHost, true);
        episodeName = this.getValueFromObjectByKeyIgnoreCase(videoAnalysis.file.tags, 'title') ?? episodeName;
        durationInSeconds = parseInt(videoAnalysis.file.duration, 10);  // parseInt (We don't care about the millis)
      }

      await MediaLibraryTable.getInstance().updateLibraryMedia(library.id, file.getPath(), titleId, episodeName, seasonNumber, episodeNumber, new Date(), durationInSeconds);
    }
  }

  private parseMediaTitleDirectoryName(directoryName: string): { title: string, externalMetaDataProviders: { [identifier: string]: number } } {
    const externalMetaDataProvidersPattern = /\[([a-z0-9]+)-([a-z0-9]+)]$/i;
    const externalMetaDataProviders: { [identifier: string]: number } = {};

    let title = directoryName.trim();
    let externalMetaDataProvidersMatch: RegExpMatchArray | null;
    while ((externalMetaDataProvidersMatch = title.match(externalMetaDataProvidersPattern)) != null) {
      const identifier = externalMetaDataProvidersMatch[1];
      const id = parseInt(externalMetaDataProvidersMatch[2], 10);
      externalMetaDataProviders[identifier] = id;
      title = title.substring(0, externalMetaDataProvidersMatch.index).trimEnd();
    }

    return {
      title,
      externalMetaDataProviders
    };
  }

  private extractSeasonFromFileName(fileName: string): number | null {
    const seasonPatterns = [
      /Season[ ._-]?(\d+)/i,
      /S(\d+)/i,
      /S(\d+)[ :._-]?E\d+/i
    ];

    for (const seasonPattern of seasonPatterns) {
      const seasonMatch = fileName.match(seasonPattern);
      if (seasonMatch != null) {
        return parseInt(seasonMatch[1], 10);
      }
    }
    return null;
  }

  private extractEpisodeFromFileName(fileName: string): number | null {
    const episodePatterns = [
      /Episode[ ._-]?(\d+)/i,
      /E(\d+)/i,
      /S\d+[ :._-]?E(\d+)/i
    ];

    for (const episodePattern of episodePatterns) {
      const episodeMatch = fileName.match(episodePattern);
      if (episodeMatch != null) {
        return parseInt(episodeMatch[1], 10);
      }
    }
    return null;
  }

  private getValueFromObjectByKeyIgnoreCase(object: { [key: string]: any }, key: string): string | null {
    key = key.toLowerCase();

    for (const objectKey in object) {
      if (objectKey.toLowerCase() === key) {
        return object[objectKey];
      }
    }
    return null;
  }
}
