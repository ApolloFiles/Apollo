import Fs from 'node:fs';
import Path from 'node:path';
import { getFileNameCollator } from '../../../../Constants';

export type MetaProvider = {
  providerId: string;
  mediaId: string;
};

export interface MovieVariant {
  name?: string;
  filePath: string;
}

export interface ExtraMedia extends MovieVariant {
  type?: 'trailer' | 'interview' | 'poster' | 'backdrop' | 'logo';
}

export type MovieAnalysis = {
  name: string;
  year?: number;
  metaProviders: MetaProvider[];

  variants: MovieVariant[];
  extras?: ExtraMedia[];
};

// TODO: There should probably be some mime type detection at some point of the analysis/scan chain to prevent stuff like `trailer.png` (image/png) from being added as a trailer.
export default class MovieDirectoryAnalyser {
  private static readonly YEAR_PATTERN = /\s+(\(\d{4}\))$/u;
  private static readonly TRAILING_META_PROVIDER_TAG_PATTERN = /\s+(\[[a-z][a-z0-9_]*-[a-z0-9_-]*\])$/iu;

  async analyze(directoryPath: string): Promise<MovieAnalysis | null> {
    const variantsAndExtras = await this.findMediaFiles(directoryPath);
    if (variantsAndExtras.variants.length <= 0 && (variantsAndExtras.extras?.length ?? 0) <= 0) {
      return null;
    }

    variantsAndExtras.variants.sort((a, b) => getFileNameCollator().compare(a.filePath, b.filePath));
    variantsAndExtras.extras?.sort((a, b) => getFileNameCollator().compare(a.filePath, b.filePath));
    return {
      ...this.extractBasicInfoFromName(Path.basename(directoryPath)),
      ...variantsAndExtras
    };
  }

  private async findMediaFiles(directoryPath: string): Promise<Pick<MovieAnalysis, 'variants' | 'extras'>> {
    const directoryHandle = await Fs.promises.opendir(directoryPath);

    const variants: MovieVariant[] = [];
    const extras: ExtraMedia[] = [];

    for await (const dirent of directoryHandle) {
      if (dirent.isDirectory()) {
        extras.push(...await this.findExtrasInSubDirectory(Path.join(directoryHandle.path, dirent.name)));
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

      variants.push({
        filePath: Path.join(directoryHandle.path, dirent.name)
      });
    }

    if (extras.length <= 0) {
      return { variants };
    }
    return { variants, extras };
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

  private extractBasicInfoFromName(directoryName: string): Pick<MovieAnalysis, 'name' | 'year' | 'metaProviders'> {
    let name = directoryName.trim();
    let year: string | undefined;
    const metaProviders: MetaProvider[] = [];

    let metaProviderTagMatch = MovieDirectoryAnalyser.TRAILING_META_PROVIDER_TAG_PATTERN.exec(name);
    while (metaProviderTagMatch != null) {
      const tagValue = metaProviderTagMatch[1].slice(1, -1);
      const providerId = tagValue.split('-')[0].toLowerCase();

      metaProviders.push({
        providerId,
        mediaId: tagValue.slice(providerId.length + 1)
      });
      name = name.substring(0, metaProviderTagMatch.index).trimEnd();

      metaProviderTagMatch = MovieDirectoryAnalyser.TRAILING_META_PROVIDER_TAG_PATTERN.exec(name);
    }

    const yearMatch = MovieDirectoryAnalyser.YEAR_PATTERN.exec(name);
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
}
