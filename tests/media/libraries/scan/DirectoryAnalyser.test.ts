import Fs from 'node:fs';
import Path from 'node:path';
import AbstractUser from '../../../../src/AbstractUser';
import DirectoryAnalyser, {
  MediaAnalysis,
  MetaProvider,
  VideoFile
} from '../../../../src/media/libraries/scan/analyser/DirectoryAnalyser';
import UserStorage from '../../../../src/UserStorage';

const directoryAnalyser = new DirectoryAnalyser();
let user: AbstractUser;
let movieRootDirectory: string;

async function setupTestEnvironment(): Promise<void> {
  user = await new UserStorage().createUser('DirectoryAnalyserTest');
  movieRootDirectory = user.getDefaultFileSystem().getAbsolutePathOnHost();
}

/* Common */

describe('Simple directories without additional meta info in their name', () => {
  beforeEach(setupTestEnvironment);

  test('Non existing directory', async () => {
    const movieDir = Path.join(movieRootDirectory, 'Non existing directory (2024)');

    expect(Fs.existsSync(movieDir)).toBe(false);
    await expect(directoryAnalyser.analyze(movieDir)).rejects.toThrow();
  });

  test('Path is a file instead of directory', async () => {
    const movieFilePath = Path.join(movieRootDirectory, 'video.mp4');
    await Fs.promises.writeFile(movieFilePath, '');

    await expect(directoryAnalyser.analyze(movieFilePath)).rejects.toThrow();
  });

  test('Empty directory', async () => {
    const movieDir = Path.join(movieRootDirectory, 'Empty directory (2024)');
    await Fs.promises.mkdir(movieDir);

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toBeNull();
  });

  test('Name is TV Show (one episode)', async () => {
    const movieDir = Path.join(movieRootDirectory, 'TV Show');
    const seasonDir = Path.join(movieDir, 'Season 01');
    await Fs.promises.mkdir(seasonDir, { recursive: true });
    await Fs.promises.writeFile(Path.join(seasonDir, 'Episode 04.mkv'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'TV Show',
      year: undefined,
      metaProviders: [],
      videoFiles: [{
        filePath: Path.join(seasonDir, 'Episode 04.mkv'),
        tvShow: {
          season: 1,
          episode: 4
        }
      }]
    });
  });

  test('Name is TV Show (two episode files)', async () => {
    const movieDir = Path.join(movieRootDirectory, 'TV Show');
    const seasonDir = Path.join(movieDir, 'Season 01');
    await Fs.promises.mkdir(seasonDir, { recursive: true });
    await Fs.promises.writeFile(Path.join(seasonDir, 'Episode 01.avi'), '');
    await Fs.promises.writeFile(Path.join(seasonDir, 'Episode 02.avi'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'TV Show',
      year: undefined,
      metaProviders: [],
      videoFiles: [
        {
          filePath: Path.join(seasonDir, 'Episode 01.avi'),
          tvShow: {
            season: 1,
            episode: 1
          }
        },
        {
          filePath: Path.join(seasonDir, 'Episode 02.avi'),
          tvShow: {
            season: 1,
            episode: 2
          }
        }
      ]
    });
  });

  test('Name is Movie (one video file)', async () => {
    const movieDir = Path.join(movieRootDirectory, 'Movie');
    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Movie.mkv'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Movie',
      year: undefined,
      metaProviders: [],
      videoFiles: [{ filePath: Path.join(movieDir, 'Movie.mkv') }]
    });
  });

  test('Name is Movie (two video files)', async () => {
    const movieDir = Path.join(movieRootDirectory, 'Movie');
    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Movie-cd1.avi'), '');
    await Fs.promises.writeFile(Path.join(movieDir, 'Movie-cd2.avi'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Movie',
      year: undefined,
      metaProviders: [],
      videoFiles: [{ filePath: Path.join(movieDir, 'Movie-cd1.avi') }, { filePath: Path.join(movieDir, 'Movie-cd2.avi') }]
    });
  });
});

describe('Directories with name and year', () => {
  beforeEach(setupTestEnvironment);

  test('Movie with one video file', async () => {
    const movieDir = Path.join(movieRootDirectory, 'Film (2008)');

    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Film.mkv'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Film',
      year: 2008,
      metaProviders: [],
      videoFiles: [{ filePath: Path.join(movieDir, 'Film.mkv') }]
    });
  });

  test('TV Show with two seasons', async () => {
    const movieDir = Path.join(movieRootDirectory, 'TV Show (2010)');
    const season1Dir = Path.join(movieDir, 'Season 1');
    const season2Dir = Path.join(movieDir, 'Volume 02');

    await Fs.promises.mkdir(season1Dir, { recursive: true });
    await Fs.promises.mkdir(season2Dir);
    await Fs.promises.writeFile(Path.join(season1Dir, 'Episode 1.avi'), '');
    await Fs.promises.writeFile(Path.join(season2Dir, 'S02E01.avi'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'TV Show',
      year: 2010,
      metaProviders: [],
      videoFiles: [
        {
          filePath: Path.join(season1Dir, 'Episode 1.avi'),
          tvShow: {
            season: 1,
            episode: 1
          }
        },
        {
          filePath: Path.join(season2Dir, 'S02E01.avi'),
          tvShow: {
            season: 2,
            episode: 1
          }
        }
      ]
    });
  });
});

describe('extra files', () => {
  beforeEach(setupTestEnvironment);

  test.each([
    'Film (2010) - Trailer.mp4',
    'Trailer.mp4',
    'trailer.mp4',
    'trailers/main.mp4',
    'Trailers/feature.mp4'
  ])('Trailer: %s', async (trailerFileName: string) => {
    const movieDir = Path.join(movieRootDirectory, 'Film (2010)');
    const trailerFile = Path.join(movieDir, trailerFileName);

    await Fs.promises.mkdir(Path.dirname(trailerFile), { recursive: true });
    await Fs.promises.writeFile(trailerFile, '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Film',
      year: 2010,
      metaProviders: [],
      videoFiles: [],
      extras: [{ type: 'trailer', filePath: trailerFile }]
    });
  });

  test.each([
    'Film (2010) - Interview.mp4',
    'interview.mp4',
    'Interview.mp4',
    'interviews/The Art of Movie Making.mp4',
    'Interviews/An Animators View on Things.mp4'
  ])('Interview: %s', async (interviewFileName: string) => {
    const movieDir = Path.join(movieRootDirectory, 'Film (2010)');
    const interviewFile = Path.join(movieDir, interviewFileName);

    await Fs.promises.mkdir(Path.dirname(interviewFile), { recursive: true });
    await Fs.promises.writeFile(interviewFile, '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Film',
      year: 2010,
      metaProviders: [],
      videoFiles: [],
      extras: [{ type: 'interview', filePath: interviewFile }]
    });
  });

  test.each([
    'poster.png',
    'poster.jpg',
    'Poster.JPEG',
    'cover.png',
    'folder.jpg'
  ])('Poster: %s', async (posterFileName: string) => {
    const movieDir = Path.join(movieRootDirectory, 'Movie (2020)');
    const posterFile = Path.join(movieDir, posterFileName);

    await Fs.promises.mkdir(Path.dirname(posterFile), { recursive: true });
    await Fs.promises.writeFile(posterFile, '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Movie',
      year: 2020,
      metaProviders: [],
      videoFiles: [],
      extras: [{ type: 'poster', filePath: posterFile }]
    });
  });

  test.each([
    'backdrop.png',
    'backdrop.jpg',
    'Backdrop.JPEG',
    'background.png'
  ])('Backdrop: %s', async (backdropFileName: string) => {
    const movieDir = Path.join(movieRootDirectory, 'Movie (2021)');
    const backdropFile = Path.join(movieDir, backdropFileName);

    await Fs.promises.mkdir(Path.dirname(backdropFile), { recursive: true });
    await Fs.promises.writeFile(backdropFile, '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Movie',
      year: 2021,
      metaProviders: [],
      videoFiles: [],
      extras: [{ type: 'backdrop', filePath: backdropFile }]
    });
  });

  test.each([
    'logo.png',
    'logo.jpg',
    'Logo.JPEG'
  ])('Logo: %s', async (logoFileName: string) => {
    const movieDir = Path.join(movieRootDirectory, 'TV Show (2021)');
    const logoFile = Path.join(movieDir, logoFileName);

    await Fs.promises.mkdir(Path.dirname(logoFile), { recursive: true });
    await Fs.promises.writeFile(logoFile, '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'TV Show',
      year: 2021,
      metaProviders: [],
      videoFiles: [],
      extras: [{ type: 'logo', filePath: logoFile }]
    });
  });
});

/* TV Shows */

describe('TV Show directories with name and meta-provider-identifier', () => {
  beforeEach(setupTestEnvironment);

  test.each([
    ['[imdbid-tt0106145]', [{ providerId: 'imdbid', mediaId: 'tt0106145' }]],
    ['[tEsT-123]', [{ providerId: 'test', mediaId: '123' }]],
    ['[longName-movie-321]', [{ providerId: 'longname', mediaId: 'movie-321' }]],
    ['[long_Name-movie-321]', [{ providerId: 'long_name', mediaId: 'movie-321' }]],
    ['[tEsT-123] [tEsT-123]', [{ providerId: 'test', mediaId: '123' }, { providerId: 'test', mediaId: '123' }]]
  ])('meta-provider-identifier: %s', async (nameSuffix: string, expectedMetaProviders: MetaProvider[]) => {
    const movieDir = Path.join(movieRootDirectory, `TV Show (2008) ${nameSuffix}`);
    const seasonDir = Path.join(movieDir, 'Season 1');

    await Fs.promises.mkdir(seasonDir, { recursive: true });
    await Fs.promises.writeFile(Path.join(seasonDir, 'E024.mkv'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'TV Show',
      year: 2008,
      metaProviders: expectedMetaProviders,
      videoFiles: [
        {
          filePath: Path.join(seasonDir, 'E024.mkv'),
          tvShow: {
            season: 1,
            episode: 24
          }
        }
      ]
    });
  });

  test.each([
    ['[FullHD]', '[FullHD]', []],
    ['[imdbid-tt0106145] [FullHD]', '[imdbid-tt0106145] [FullHD]', []],
    ['[imdbid-tt0106145] [FullHD] [tEsT-123]', '[imdbid-tt0106145] [FullHD]', [{ providerId: 'test', mediaId: '123' }]]
  ])('cannot parse year with invalid meta-provider-identifier: %s', async (nameSuffix: string, expectedNameSuffix: string, expectedMetaProviders: MetaProvider[]) => {
    const movieDir = Path.join(movieRootDirectory, `TV Show (2008) ${nameSuffix}`);
    const seasonDir = Path.join(movieDir, 'Season 1');

    await Fs.promises.mkdir(seasonDir, { recursive: true });
    await Fs.promises.writeFile(Path.join(seasonDir, 'Episode 01.mkv'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: `TV Show (2008) ${expectedNameSuffix}`,
      year: undefined,
      metaProviders: expectedMetaProviders,
      videoFiles: [{
        filePath: Path.join(seasonDir, 'Episode 01.mkv'),
        tvShow: {
          season: 1,
          episode: 1
        }
      }]
    });
  });
});

/* Movies */

describe('Movie directories with name and meta-provider-identifier', () => {
  beforeEach(setupTestEnvironment);

  test.each([
    ['[imdbid-tt0106145]', [{ providerId: 'imdbid', mediaId: 'tt0106145' }]],
    ['[tEsT-123]', [{ providerId: 'test', mediaId: '123' }]],
    ['[longName-movie-321]', [{ providerId: 'longname', mediaId: 'movie-321' }]],
    ['[long_Name-movie-321]', [{ providerId: 'long_name', mediaId: 'movie-321' }]],
    ['[tEsT-123] [tEsT-123]', [{ providerId: 'test', mediaId: '123' }, { providerId: 'test', mediaId: '123' }]]
  ])('meta-provider-identifier: %s', async (nameSuffix: string, expectedMetaProviders: MetaProvider[]) => {
    const movieDir = Path.join(movieRootDirectory, `Film (2008) ${nameSuffix}`);

    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Film.mkv'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Film',
      year: 2008,
      metaProviders: expectedMetaProviders,
      videoFiles: [{ filePath: Path.join(movieDir, 'Film.mkv') }]
    });
  });

  test.each([
    ['[FullHD]', '[FullHD]', []],
    ['[imdbid-tt0106145] [FullHD]', '[imdbid-tt0106145] [FullHD]', []],
    ['[imdbid-tt0106145] [FullHD] [tEsT-123]', '[imdbid-tt0106145] [FullHD]', [{ providerId: 'test', mediaId: '123' }]]
  ])('cannot parse year with invalid meta-provider-identifier: %s', async (nameSuffix: string, expectedNameSuffix: string, expectedMetaProviders: MetaProvider[]) => {
    const movieDir = Path.join(movieRootDirectory, `Film (2008) ${nameSuffix}`);

    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Film.mkv'), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: `Film (2008) ${expectedNameSuffix}`,
      year: undefined,
      metaProviders: expectedMetaProviders,
      videoFiles: [{ filePath: Path.join(movieDir, 'Film.mkv') }]
    });
  });
});

describe('Multiple movie variants in one directory', () => {
  beforeEach(setupTestEnvironment);

  test.each([
    ['Film', 'Film - 1080p.mp4', '1080p'],
    ['Film (2010)', 'Film (2010) - 1080p.mp4', '1080p'],
    ['Film (2010)', 'Film - 1080p.mp4', undefined],
    ['Film (2010) [imdbid-tt0106145]', 'Film (2010) [imdbid-tt0106145] - 1080p.mp4', '1080p'],
    ['Film (2010) [imdbid-tt0106145]', 'Film (2010) - 1080p.mp4', '1080p']
  ])('%s', async (dirName: string, fileName: string, expectedVariantName: VideoFile['title']) => {
    const movieDir = Path.join(movieRootDirectory, dirName);

    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, fileName), '');

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Film',
      year: 2010,
      metaProviders: [],
      videoFiles: [{ title: expectedVariantName, filePath: Path.join(movieDir, fileName) }]
    });
  });

  test(`1080p, 720p, Director's Cut`, async () => {
    const movieDir = Path.join(movieRootDirectory, 'Film');

    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Film - 720p.mkv'), '');
    await Fs.promises.writeFile(Path.join(movieDir, 'Film \u2013 1080p.mkv'), '');  // en-dash
    await Fs.promises.writeFile(Path.join(movieDir, `Film \u2014 Director's Cut.mkv`), ''); // em-dash

    await expect(directoryAnalyser.analyze(movieDir)).resolves.toStrictEqual<MediaAnalysis>({
      name: 'Film',
      year: undefined,
      metaProviders: [],
      videoFiles: [
        { title: '1080p', filePath: Path.join(movieDir, 'Film – 1080p.mkv') },
        { title: '720p', filePath: Path.join(movieDir, 'Film – 1080p.mkv') },
        { title: 'Directors Cut', filePath: Path.join(movieDir, `Film - Director's Cut.mkv`) }
      ]
    });
  });
});
