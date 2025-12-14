import { singleton } from 'tsyringe';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import FfprobeExecutor from '../../../ffmpeg/FfprobeExecutor.js';
import type MediaLibrary from '../database/MediaLibrary.js';
import AbstractScanner from './AbstractScanner.js';
import type MediaLibraryMediaWriter from './MediaLibraryMediaWriter.js';

type EpisodeInfo = {
  seasonNumber?: number,
  episodeNumber?: number,
}

@singleton()
export default class TvShowDirectoryScanner extends AbstractScanner {
  private static SEASON_DIR_REGEX = /^(?:S(?:eason)?|Volume)[\s_.-]*(\d+)$/i;
  private static EPISODE_FILE_REGEX_LONG = /Episode[\s_.-]*\d+/i;
  private static EPISODE_FILE_REGEX_SHORT = /S(\d+)[\s_.-]*E(\d+)/i;

  constructor(ffprobeExecutor: FfprobeExecutor) {
    super(ffprobeExecutor);
  }

  async scan(library: MediaLibrary, mediaDirectory: VirtualFile, writer: MediaLibraryMediaWriter): Promise<void> {
    const mediaInfo = this.extractInfoFromMediaDirectoryName(mediaDirectory);

    // TODO: It might make sense to 'overtake' other existing media here, in case the directory got renamed or so (and the other media directory no longer exists)
    const mediaId = await writer.createIfNotExists(library.id, mediaDirectory.toURI().toString(), mediaInfo.title);

    for (const file of (await mediaDirectory.getFiles())) {
      if (await file.isFile()) {
        await this.processPotentialEpisodeFile(writer, mediaId, mediaDirectory, file, null);
        continue;
      }

      const seasonNumber = this.extractSeasonNumberFromDir(file);
      if (seasonNumber == null) {
        continue;
      }

      for (const potentialEpisodeFile of (await file.getFiles())) {
        await this.processPotentialEpisodeFile(writer, mediaId, mediaDirectory, potentialEpisodeFile, null);
      }
    }
  }

  // TODO: Maybe move these 'helper' methods used by the Detector into another shared class?
  looksLikeSeasonDirectory(file: VirtualFile): boolean {
    return this.extractSeasonNumberFromDir(file) != null;
  }

  looksLikeEpisodeFile(file: VirtualFile): boolean {
    return this.extractEpisodeInfoFromFileName(file).episodeNumber != null;
  }

  private async processPotentialEpisodeFile(
    writer: MediaLibraryMediaWriter,
    mediaId: bigint,
    mediaDirectory: VirtualFile,
    file: VirtualFile,
    seasonNumber: number | null,
  ): Promise<void> {
    const episodeInfo = this.extractEpisodeInfoFromFileName(file);
    if (episodeInfo.episodeNumber == null) {
      return;
    }

    seasonNumber = seasonNumber ?? episodeInfo.seasonNumber ?? null;
    if (seasonNumber == null) {
      return;
    }

    let fallbackTitle = `Episode ${episodeInfo.episodeNumber.toString().padStart(2, '0')}`;
    const { title, synopsis, durationInSec } = await this.extractCommonVideoMetadata(file, fallbackTitle);

    await writer.createMediaItemIfNotExist(
      mediaId,
      this.getRelativeFilePath(mediaDirectory, file),
      title,
      durationInSec,
      synopsis,
      episodeInfo.seasonNumber ?? null,
      episodeInfo.episodeNumber ?? null,
    );
  }

  private extractSeasonNumberFromDir(directory: VirtualFile): number | null {
    const dirName = directory.getFileName().trim();

    const match = dirName.match(TvShowDirectoryScanner.SEASON_DIR_REGEX);
    if (match) {
      return match[1] ? parseInt(match[1], 10) : null;
    }

    return null;
  }

  private extractEpisodeInfoFromFileName(file: VirtualFile): EpisodeInfo {
    const fileName = file.getFileName().trim();

    let match = fileName.match(TvShowDirectoryScanner.EPISODE_FILE_REGEX_LONG);
    if (match) {
      const episodeNumberMatch = match[0].match(/\d+/);
      const episodeNumber = episodeNumberMatch ? parseInt(episodeNumberMatch[0], 10) : undefined;

      return {
        episodeNumber,
      };
    }

    match = fileName.match(TvShowDirectoryScanner.EPISODE_FILE_REGEX_SHORT);
    if (match) {
      const seasonNumber = match[1] ? parseInt(match[1], 10) : undefined;
      const episodeNumber = match[2] ? parseInt(match[2], 10) : undefined;

      return {
        seasonNumber,
        episodeNumber,
      };
    }

    return {};
  }
}
