import Fs from 'node:fs/promises';
import Path from 'node:path';
import Library from '../../Library';
import MovieDirectoryAnalyser, { MovieAnalysis } from './MovieDirectoryAnalyser';

export default class MovieScanner {
  private readonly movieDirectoryAnalyser: MovieDirectoryAnalyser;

  constructor(movieDirectoryAnalyser: MovieDirectoryAnalyser) {
    this.movieDirectoryAnalyser = movieDirectoryAnalyser;
  }

  async scanMovieLibrary(library: Library): Promise<MovieAnalysis[]> {
    const movies: MovieAnalysis[] = [];
    for (const libDirectory of library.directories) {
      const directoryPath = libDirectory.getAbsolutePathOnHost();
      if (directoryPath == null) {
        console.warn(`Library #${library.id} has a directory with no absolute path on host: ${libDirectory.getPath()}`);
        continue;
      }

      const discoveredMovies = await this.scanDirectory(directoryPath);
      movies.push(...discoveredMovies);
    }
    return movies;
  }

  private async scanDirectory(directory: string): Promise<MovieAnalysis[]> {
    const entries = await Fs.readdir(directory, { withFileTypes: true });
    const result: MovieAnalysis[] = [];

    for (const entry of entries) {
      const fullPath = Path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const movie = await this.movieDirectoryAnalyser.analyze(fullPath);
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
