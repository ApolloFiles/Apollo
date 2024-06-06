import Fs from 'node:fs';
import Path from 'node:path';
import { getFileNameCollator, getFileTypeUtils } from '../../../../Constants';

export type MetaProvider = {
  providerId: string;
  mediaId: string;
};

export interface MediaFile {
  filePath: string;
  title?: string;
}

export interface VideoFile extends MediaFile {
  tvShow?: {
    season: number;
    episode: number;
  };
}

export interface ExtraMedia extends MediaFile {
  type: 'trailer' | 'interview' | 'poster' | 'backdrop' | 'logo';
}

export type MediaAnalysis = {
  rootDirectory: string;
  name: string;
  year?: number;
  metaProviders: MetaProvider[];

  videoFiles: VideoFile[];
  extras?: ExtraMedia[];
};

export default class DirectoryAnalyser {
  private static readonly YEAR_PATTERN = /\s+(\(\d{4}\))$/u;
  private static readonly TRAILING_META_PROVIDER_TAG_PATTERN = /\s+(\[[a-z][a-z0-9_]*-[a-z0-9_-]*\])$/iu;

  async analyze(directoryPath: string): Promise<MediaAnalysis | null> {
    const variantsAndExtras = await this.findMediaFiles(directoryPath);
    if (variantsAndExtras.videoFiles.length <= 0 && (variantsAndExtras.extras?.length ?? 0) <= 0) {
      return null;
    }

    variantsAndExtras.videoFiles.sort(this.compareVideoFiles);
    variantsAndExtras.extras?.sort((a, b) => getFileNameCollator().compare(a.filePath, b.filePath));
    return {
      rootDirectory: directoryPath,
      ...this.extractBasicInfoFromName(Path.basename(directoryPath)),
      ...variantsAndExtras
    };
  }

  private async findMediaFiles(directoryPath: string): Promise<Pick<MediaAnalysis, 'videoFiles' | 'extras'>> {
    const directoryHandle = await Fs.promises.opendir(directoryPath);

    const videoFiles: VideoFile[] = [];
    const extras: ExtraMedia[] = [];

    for await (const dirent of directoryHandle) {
      if (dirent.isDirectory()) {
        const extrasInSubDirectory = await this.findExtrasInSubDirectory(Path.join(directoryHandle.path, dirent.name));
        if (extrasInSubDirectory.length > 0) {
          extras.push(...extrasInSubDirectory);
          continue;
        }

        const seasonNumber = this.extractSeasonFromFileName(dirent.name);
        if (seasonNumber == null) {
          continue;
        }

        videoFiles.push(...(await this.findEpisodesInSeasonDirectory(Path.join(directoryHandle.path, dirent.name), seasonNumber)));
        continue;
      }

      const potentialExtraType = this.determineExtraTypeByFileName(dirent.name);
      if (potentialExtraType != null) {
        extras.push({
          type: potentialExtraType,
          filePath: Path.join(directoryHandle.path, dirent.name)
        });
        continue;
      }

      const videoFilePath = Path.join(directoryHandle.path, dirent.name);
      if ((await getFileTypeUtils().getMimeType(videoFilePath))?.startsWith('video/') === true) {
        videoFiles.push({
          filePath: videoFilePath
        });
      }
    }

    if (extras.length <= 0) {
      return { videoFiles };
    }
    return { videoFiles, extras };
  }

  private async findEpisodesInSeasonDirectory(seasonDirectoryPath: string, seasonNumber: number): Promise<VideoFile[]> {
    const episodes: VideoFile[] = [];

    const directoryHandle = await Fs.promises.opendir(seasonDirectoryPath);
    for await (const dirent of directoryHandle) {
      if (!dirent.isFile()) {
        continue;
      }

      const episodeNumber = this.extractEpisodeFromFileName(dirent.name);
      if (episodeNumber == null) {
        continue;
      }

      episodes.push({
        filePath: Path.join(directoryHandle.path, dirent.name),
        tvShow: {
          season: seasonNumber,
          episode: episodeNumber
        }
      });
    }

    return episodes;
  }

  private async findExtrasInSubDirectory(directoryPath: string): Promise<ExtraMedia[]> {
    const normalizedDirectoryName = Path.basename(directoryPath).toLowerCase();

    let type: 'trailer' | 'interview';
    if (normalizedDirectoryName === 'trailers') {
      type = 'trailer';
    } else if (normalizedDirectoryName === 'interviews') {
      type = 'interview';
    } else {
      return [];
    }

    const directoryHandle = await Fs.promises.opendir(directoryPath);
    const extras: ExtraMedia[] = [];
    for await (const dirent of directoryHandle) {
      if (!dirent.isFile()) {
        continue;
      }

      extras.push({
        type,
        filePath: Path.join(directoryHandle.path, dirent.name)
      });
    }
    return extras;
  }

  private extractBasicInfoFromName(directoryName: string): Pick<MediaAnalysis, 'name' | 'year' | 'metaProviders'> {
    let name = directoryName.trim();
    let year: string | undefined;
    const metaProviders: MetaProvider[] = [];

    let metaProviderTagMatch = DirectoryAnalyser.TRAILING_META_PROVIDER_TAG_PATTERN.exec(name);
    while (metaProviderTagMatch != null) {
      const tagValue = metaProviderTagMatch[1].slice(1, -1);
      const providerId = tagValue.split('-')[0].toLowerCase();

      metaProviders.push({
        providerId,
        mediaId: tagValue.slice(providerId.length + 1)
      });
      name = name.substring(0, metaProviderTagMatch.index).trimEnd();

      metaProviderTagMatch = DirectoryAnalyser.TRAILING_META_PROVIDER_TAG_PATTERN.exec(name);
    }

    const yearMatch = DirectoryAnalyser.YEAR_PATTERN.exec(name);
    if (yearMatch != null) {
      year = yearMatch[1].slice(1, -1);
      name = name.slice(0, yearMatch.index);
    }

    return {
      name: name,
      year: year ? parseInt(year, 10) : undefined,
      metaProviders
    };
  }

  private extractSeasonFromFileName(fileName: string): number | null {
    const seasonPatterns = [
      /Season[ ._-]?(\d+)/i,
      /Volume[ ._-]?(\d+)/i,
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

  private determineExtraTypeByFileName(fileName: string): ExtraMedia['type'] | null {
    const normalizedFileName = Path.basename(fileName, Path.extname(fileName)).toLowerCase();
    if (normalizedFileName === 'poster' || normalizedFileName === 'cover' || normalizedFileName === 'folder') {
      return 'poster';
    }
    if (normalizedFileName === 'backdrop' || normalizedFileName === 'background') {
      return 'backdrop';
    }
    if (normalizedFileName === 'logo') {
      return 'logo';
    }
    if (normalizedFileName === 'trailer' || /\s+trailer$/iu.test(normalizedFileName)) {
      return 'trailer';
    }
    if (normalizedFileName === 'interview' || /\s+interview$/iu.test(normalizedFileName)) {
      return 'interview';
    }

    return null;
  }

  private compareVideoFiles(a: VideoFile, b: VideoFile): number {
    if (a.tvShow != null && b.tvShow != null) {
      if (a.tvShow.season !== b.tvShow.season) {
        return a.tvShow.season - b.tvShow.season;
      }

      return a.tvShow.episode - b.tvShow.episode;
    }

    return getFileNameCollator().compare(a.filePath, b.filePath);
  }
}
