import Fs from 'node:fs';
import Path from 'node:path';
import AbstractUser from '../../../../../src/AbstractUser';
import Library from '../../../../../src/media/libraries/Library';
import MovieDirectoryAnalyser from '../../../../../src/media/libraries/scan/movie/MovieDirectoryAnalyser';
import MovieScanner from '../../../../../src/media/libraries/scan/movie/MovieScanner';
import UserStorage from '../../../../../src/UserStorage';

const movieScanner = new MovieScanner(new MovieDirectoryAnalyser());
let user: AbstractUser;
let movieRootDirectory: string;

async function setupTestEnvironment(): Promise<void> {
  user = await new UserStorage().createUser('MovieDirectoryAnalyserTest');
  movieRootDirectory = user.getDefaultFileSystem().getAbsolutePathOnHost();
}

describe('Scan movie library', () => {
  beforeEach(setupTestEnvironment);

  test('One movie at library root', async () => {
    const movieDir = Path.join(movieRootDirectory, 'Film (2008)');

    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Film.mkv'), '');

    const library = new Library(user, '123', 'MovieScannerTest', [user.getDefaultFileSystem().getFile('/')]);
    const scanResult = await movieScanner.scanMovieLibrary(library);
    expect(scanResult).toHaveLength(1);
    expect(scanResult[0].name).toBe('Film');
    expect(scanResult[0].variants).toHaveLength(1);
    expect(scanResult[0].extras).toBeUndefined();
  });

  test('Two movies with interviews at library root', async () => {
    const movieDir1 = Path.join(movieRootDirectory, 'Film (2008)');
    const interviewDir1 = Path.join(movieDir1, 'Interviews');
    await Fs.promises.mkdir(interviewDir1, { recursive: true });
    await Fs.promises.writeFile(Path.join(movieDir1, 'Film.mkv'), '');
    await Fs.promises.writeFile(Path.join(interviewDir1, 'The Art of Movie Making.mp4'), '');

    const movieDir2 = Path.join(movieRootDirectory, 'Another Film (2010)');
    const interviewDir2 = Path.join(movieDir2, 'Interviews');
    await Fs.promises.mkdir(interviewDir2, { recursive: true });
    await Fs.promises.writeFile(Path.join(movieDir2, 'Another Film.mkv'), '');
    await Fs.promises.writeFile(Path.join(interviewDir2, 'The Art of Movie Making.mp4'), '');

    const library = new Library(user, '123', 'MovieScannerTest', [user.getDefaultFileSystem().getFile('/')]);
    const scanResult = await movieScanner.scanMovieLibrary(library);

    expect(scanResult).toHaveLength(2);
    expect([scanResult[0].name, scanResult[1].name].sort()).toStrictEqual(['Another Film', 'Film']);

    expect(scanResult[0].variants).toHaveLength(1);
    expect(scanResult[0].extras).toHaveLength(1);

    expect(scanResult[1].variants).toHaveLength(1);
    expect(scanResult[1].extras).toHaveLength(1);
  });

  test('Two movies with interviews within a nested directory structure', async () => {
    const nestedMovieRoot1 = Path.join(movieRootDirectory, 'All Movies', 'My personal favorites', '20xx');
    const nestedMovieRoot2 = Path.join(movieRootDirectory, 'All Movies', 'My personal non-favorites', 'any year');

    const movieDir1 = Path.join(nestedMovieRoot1, 'Loved Film (2008)');
    const interviewDir1 = Path.join(movieDir1, 'Interviews');
    await Fs.promises.mkdir(interviewDir1, { recursive: true });
    await Fs.promises.writeFile(Path.join(movieDir1, 'Film.mkv'), '');
    await Fs.promises.writeFile(Path.join(interviewDir1, 'The Art of Movie Making.mp4'), '');

    const movieDir2 = Path.join(nestedMovieRoot2, 'Hated Film (2010)');
    const interviewDir2 = Path.join(movieDir2, 'Interviews');
    await Fs.promises.mkdir(interviewDir2, { recursive: true });
    await Fs.promises.writeFile(Path.join(movieDir2, 'Another Film.mkv'), '');
    await Fs.promises.writeFile(Path.join(interviewDir2, 'The Art of Movie Making.mp4'), '');

    const library = new Library(user, '123', 'MovieScannerTest', [user.getDefaultFileSystem().getFile('/')]);
    const scanResult = await movieScanner.scanMovieLibrary(library);

    expect(scanResult).toHaveLength(2);
    expect([scanResult[0].name, scanResult[1].name].sort()).toStrictEqual(['Hated Film', 'Loved Film']);

    expect(scanResult[0].variants).toHaveLength(1);
    expect(scanResult[0].extras).toHaveLength(1);

    expect(scanResult[1].variants).toHaveLength(1);
    expect(scanResult[1].extras).toHaveLength(1);
  });
});
