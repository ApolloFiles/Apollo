import Fs from 'node:fs/promises';
import Path from 'node:path';
import Library from '../Library';
import IMediaDirectoryAnalyser, { MediaAnalysis } from './IMediaDirectoryAnalyser';

export default class MediaLibraryScanner {
  private readonly mediaDirectoryAnalyser: IMediaDirectoryAnalyser;

  constructor(mediaDirectoryAnalyser: IMediaDirectoryAnalyser) {
    this.mediaDirectoryAnalyser = mediaDirectoryAnalyser;
  }

  async scanLibrary(library: Library): Promise<MediaAnalysis[]> {
    const discoveredMedia: MediaAnalysis[] = [];
    for (const libDirectory of library.directories) {
      const directoryPath = libDirectory.getAbsolutePathOnHost();
      if (directoryPath == null) {
        console.warn(`Library #${library.id} has a directory with no absolute path on host: ${libDirectory.getPath()}`);
        continue;
      }

      discoveredMedia.push(...(await this.scanDirectory(directoryPath)));
    }
    return discoveredMedia;
  }

  private async scanDirectory(directory: string): Promise<MediaAnalysis[]> {
    const result: MediaAnalysis[] = [];

    const entries = await Fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = Path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const movie = await this.mediaDirectoryAnalyser.analyze(fullPath);
        if (movie != null) {
          result.push(movie);
          continue;
        }

        const subDirMovies = await this.scanDirectory(fullPath);
        result.push(...subDirMovies);
      }
    }

    return result;
  }
}
