import { singleton } from 'tsyringe';
import type VirtualFile from '../../../../../files/VirtualFile.js';
import MovieDirectoryScanner from './MovieDirectoryScanner.js';
import TvShowDirectoryScanner from './TvShowDirectoryScanner.js';

@singleton()
export default class MediaDirectoryDetector {
  constructor(
    private readonly tvShowDirectoryScanner: TvShowDirectoryScanner,
    private readonly movieDirectoryScanner: MovieDirectoryScanner,
  ) {
  }

  async detect(directory: VirtualFile): Promise<'movie' | 'tv' | null> {
    const files = await directory.getFiles();

    for (const file of files) {
      if (await file.isDirectory()) {
        if (this.tvShowDirectoryScanner.looksLikeSeasonDirectory(file)) {
          return 'tv';
        }
        continue;
      }

      if (this.tvShowDirectoryScanner.looksLikeEpisodeFile(file)) {
        return 'tv';
      }
      if (this.movieDirectoryScanner.looksLikeMovieFile(directory, file)) {
        return 'movie';
      }
    }

    return null;
  }
}
