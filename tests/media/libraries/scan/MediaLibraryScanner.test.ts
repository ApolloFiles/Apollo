import Fs from 'node:fs';
import Path from 'node:path';
import Library from '../../../../src/media/libraries/Library';
import DirectoryAnalyser from '../../../../src/media/libraries/scan/analyser/DirectoryAnalyser';
import MediaLibraryAnalyser from '../../../../src/media/libraries/scan/analyser/MediaLibraryAnalyser';
import ApolloUser from '../../../../src/user/ApolloUser';
import ApolloUserStorage from '../../../../src/user/ApolloUserStorage';

const movieScanner = new MediaLibraryAnalyser(new DirectoryAnalyser());
let user: ApolloUser;
let movieRootDirectory: string;

async function setupTestEnvironment(): Promise<void> {
  user = await new ApolloUserStorage().create('MediaLibraryScannerTest');
  movieRootDirectory = user.getDefaultFileSystem().getAbsolutePathOnHost();
}

describe('Scan movie library', () => {
  beforeEach(setupTestEnvironment);

  test('One movie at library root', async () => {
    const movieDir = Path.join(movieRootDirectory, 'Film (2008)');

    await Fs.promises.mkdir(movieDir);
    await Fs.promises.writeFile(Path.join(movieDir, 'Film.mkv'), '');

    const library = new Library(user, '123', 'MovieScannerTest', [], [user.getDefaultFileSystem().getFile('/')]);
    const scanResult = await movieScanner.analyseLibrary(library);
    expect(scanResult).toHaveLength(1);
    expect(scanResult[0].name).toBe('Film');
    expect(scanResult[0].videoFiles).toHaveLength(1);
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

    const library = new Library(user, '123', 'MovieScannerTest', [], [user.getDefaultFileSystem().getFile('/')]);
    const scanResult = await movieScanner.analyseLibrary(library);

    expect(scanResult).toHaveLength(2);
    expect([scanResult[0].name, scanResult[1].name].sort()).toStrictEqual(['Another Film', 'Film']);

    expect(scanResult[0].videoFiles).toHaveLength(1);
    expect(scanResult[0].extras).toHaveLength(1);

    expect(scanResult[1].videoFiles).toHaveLength(1);
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

    const library = new Library(user, '123', 'MovieScannerTest', [], [user.getDefaultFileSystem().getFile('/')]);
    const scanResult = await movieScanner.analyseLibrary(library);

    expect(scanResult).toHaveLength(2);
    expect([scanResult[0].name, scanResult[1].name].sort()).toStrictEqual(['Hated Film', 'Loved Film']);

    expect(scanResult[0].videoFiles).toHaveLength(1);
    expect(scanResult[0].extras).toHaveLength(1);

    expect(scanResult[1].videoFiles).toHaveLength(1);
    expect(scanResult[1].extras).toHaveLength(1);
  });
});
