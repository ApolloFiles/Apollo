import LocalFile from '../../../../../files/local/LocalFile.js';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import FfprobeExecutor, { type ExtendedProbeResult } from '../../../ffmpeg/FfprobeExecutor.js';

export type MediaDirectoryInfo = {
  title: string,
  year?: number,
  metadataTagsRaw?: string,
}

export type CommonVideoMetadata = {
  title: string,
  synopsis: string | null,
  durationInSec: number,
}

export default abstract class AbstractScanner {
  private static MEDIA_DIR_REGEX = /^(.*?)(?:\s*\((\d{4})\))?((?:\s*\[[a-z0-9_.-]+])+)*$/i;

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

      return {
        title,
        year,
        metadataTagsRaw,
      };
    }

    return { title: directoryName };
  }

  protected async extractCommonVideoMetadata(file: VirtualFile, fallbackTitle: string): Promise<CommonVideoMetadata> {
    let title = fallbackTitle;
    let synopsis: string | null = null;
    let durationInSec = 0;

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
}
