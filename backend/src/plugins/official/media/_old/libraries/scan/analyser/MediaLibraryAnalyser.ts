import Fs from 'node:fs/promises';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import type Library from '../../Library.js';
import DirectoryAnalyser, { type MediaAnalysis } from './DirectoryAnalyser.js';

@singleton()
export default class MediaLibraryAnalyser {
  private readonly directoryAnalyser: DirectoryAnalyser;

  constructor(directoryAnalyser: DirectoryAnalyser) {
    this.directoryAnalyser = directoryAnalyser;
  }

  async analyseLibrary(library: Library): Promise<MediaAnalysis[]> {
    const discoveredMedia: MediaAnalysis[] = [];
    for (const directory of library.directories) {
      if (!(await directory.exists())) {
        continue;
      }

      discoveredMedia.push(...(await this.scanDirectory(directory.getAbsolutePathOnHost())));
    }
    return discoveredMedia;
  }

  private async scanDirectory(directory: string): Promise<MediaAnalysis[]> {
    const result: MediaAnalysis[] = [];

    const entries = await Fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = Path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const mediaAnalysis = await this.directoryAnalyser.analyze(fullPath);
        if (mediaAnalysis != null) {
          result.push(mediaAnalysis);
          continue;
        }

        const subDirAnalyses = await this.scanDirectory(fullPath);
        result.push(...subDirAnalyses);
      }
    }

    return result;
  }
}
