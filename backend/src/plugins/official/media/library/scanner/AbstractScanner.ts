import type { MediaLibraryMediaExternalIdSource } from '../../../../../database/prisma-client/enums.js';
import LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import FfprobeExecutor, { type ExtendedProbeResult } from '../../../ffmpeg/FfprobeExecutor.js';

type ExternalIds = Partial<Record<MediaLibraryMediaExternalIdSource, string>>;

export type MediaDirectoryInfo = {
  title: string,
  year?: number,
  externalIds?: ExternalIds,
}

export type CommonVideoMetadata = {
  title: string,
  synopsis: string | null,
  durationInSec: number,
  externalIds: ExternalIds,
}

export default abstract class AbstractScanner {
  private static MEDIA_DIR_REGEX = /^(.*?)(?:\s*\((\d{4})\))?((?:\s*[\[{][a-z0-9_.-]+[\]}])+)*$/i;
  private static EXTERNAL_ID_EXTRACTOR_REGEX = /[\[{]([a-z0-9_.]+)-([[a-z0-9_.]+)[\]}]/gi;
  private static EXTERNAL_ID_MAPPING: Record<string, MediaLibraryMediaExternalIdSource> = {
    // Plex
    'imdb': 'IMDB',
    'tmdb': 'THE_MOVIE_DB',

    // Jellyfin
    'imdbid': 'IMDB',
    'tmdbid': 'THE_MOVIE_DB',
  };

  protected constructor(
    private readonly ffprobeExecutor: FfprobeExecutor,
  ) {
  }

  protected getRelativeFilePath(mediaDirectory: VirtualFile, file: VirtualFile): string {
    const mediaDirPath = mediaDirectory.path;
    const filePath = file.path;

    if (!filePath.startsWith(mediaDirPath)) {
      throw new Error(`File path '${filePath}' is not inside media directory path '${mediaDirPath}'`);
    }
    return filePath.substring(mediaDirPath.length + 1);
  }

  protected extractInfoFromMediaDirectoryName(directory: VirtualFile): MediaDirectoryInfo {
    const directoryName = directory.getFileName().trim();

    const match = directoryName.match(AbstractScanner.MEDIA_DIR_REGEX);
    if (match) {
      const title = match[1].trim();
      const year = match[2] ? parseInt(match[2], 10) : undefined;
      const metadataTagsRaw = match[3]?.trim();
      const externalIds = metadataTagsRaw ? this.parseExternalIdFromFileNameSnippet(metadataTagsRaw) : undefined;

      return {
        title,
        year,
        externalIds,
      };
    }

    return { title: directoryName };
  }

  protected async extractCommonVideoMetadata(file: VirtualFile, fallbackTitle: string): Promise<CommonVideoMetadata> {
    let title = fallbackTitle;
    let synopsis: string | null = null;
    let durationInSec = 0;
    const externalIds: CommonVideoMetadata['externalIds'] = {};

    if (file instanceof LocalFile) {
      const fileProbe = await this.ffprobeExecutor.probe(file.getAbsolutePathOnHost(), true);
      durationInSec = Math.ceil(parseInt(fileProbe.format.duration ?? '0', 10));

      const extractedTitle = this.extractMetadataFromProbe(fileProbe, 'title');
      if (extractedTitle != null && extractedTitle.trim().length > 0) {
        title = extractedTitle.trim();
      }

      const extractedSynopsis = this.extractMetadataFromProbe(fileProbe, 'synopsis');
      if (extractedSynopsis != null && extractedSynopsis.trim().length > 0) {
        synopsis = extractedSynopsis.trim();
      }

      const theMovieDbId = this.extractMetadataFromProbe(fileProbe, 'TMDB');
      if (theMovieDbId != null) {
        externalIds['THE_MOVIE_DB'] = theMovieDbId;
      }

      const imdbId = this.extractMetadataFromProbe(fileProbe, 'IMDB');
      if (imdbId != null) {
        externalIds['IMDB'] = imdbId;
      }

      const theTvDbId = this.extractMetadataFromProbe(fileProbe, 'TVDB2');
      if (theTvDbId != null) {
        externalIds['THE_TV_DB'] = theTvDbId;
      }
    } else {
      console.error(
        '[ERROR] Cannot probe file duration for non-local files during media library scan:',
        file.toURI().toString(),
      );
    }

    return {
      title,
      synopsis,
      durationInSec,
      externalIds,
    };
  }

  protected extractMetadataFromProbe(probeResult: ExtendedProbeResult, tag: string): string | null {
    const exactMatchValue = this.getValueFromObjectByKeyIgnoreCase(probeResult.format.tags, tag);
    if (exactMatchValue !== null && exactMatchValue.trim().length > 0) {
      return exactMatchValue.trim();
    }

    const tagKeys = Object.keys(probeResult.format.tags).map(tag => tag.toLowerCase());
    const translatedTags = tagKeys.filter(key => {
      return key.startsWith(tag + '-') && /^[a-z]{3}$/.test(key.substring(tag.length + 1));
    });

    const languagePreferences = ['eng', 'und' /* undefined */];
    translatedTags.sort((a, b) => {
      const langA = a.substring(tag.length + 1);
      const langB = b.substring(tag.length + 1);
      const indexA = languagePreferences.indexOf(langA);
      const indexB = languagePreferences.indexOf(langB);
      if (indexA === -1 && indexB === -1) {
        return langA.localeCompare(langB);
      }
      if (indexA === -1) {
        return 1;
      }
      if (indexB === -1) {
        return -1;
      }
      return indexA - indexB;
    });

    for (const translatedTagKey of translatedTags) {
      const value = this.getValueFromObjectByKeyIgnoreCase(probeResult.format.tags, translatedTagKey);
      if (value != null && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private getValueFromObjectByKeyIgnoreCase(obj: Record<string, any>, key: string): string | null {
    const lowerCaseKey = key.toLowerCase();
    for (const objKey of Object.keys(obj)) {
      if (objKey.toLowerCase() === lowerCaseKey) {
        return obj[objKey];
      }
    }
    return null;
  }

  private parseExternalIdFromFileNameSnippet(metadataTagsRaw: string): ExternalIds {
    const externalIds: ExternalIds = {};

    const matches = metadataTagsRaw.matchAll(AbstractScanner.EXTERNAL_ID_EXTRACTOR_REGEX);
    for (const match of matches) {
      const key = match[1]?.toLowerCase();
      let value = match[2];
      const externalIdSource: MediaLibraryMediaExternalIdSource | undefined = AbstractScanner.EXTERNAL_ID_MAPPING[key];

      if (key && value && externalIdSource) {
        if (externalIdSource === 'THE_MOVIE_DB') {
          if (value.toLowerCase().startsWith('tv_')) {
            value = 'tv/' + value.substring('tv_'.length);
          } else if (value.toLowerCase().startsWith('movie_')) {
            value = 'movie/' + value.substring('movie_'.length);
          }
        }

        externalIds[externalIdSource] = value;
      }
    }

    return externalIds;
  }
}
