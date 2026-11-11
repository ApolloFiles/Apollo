import Fs from 'node:fs';
import Path from 'node:path';
import type { DeepMockProxy } from 'vitest-mock-extended';
import DatabaseClient from '#src/database/DatabaseClient.js';
import type LocalFile from '#src/files/local/LocalFile.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';
import type PermissionAwareFileProvider from '#src/files/provider/PermissionAwareFileProvider.js';
import type { CachedFfprobe } from '#src/plugins/official/ffmpeg/probe/CachedFfprobe.js';
import type { FullProbeResult } from '#src/plugins/official/ffmpeg/probe/FfprobeSchemas.js';
import FileTypeUtils from '#src/plugins/official/media/_old/FileTypeUtils.js';
import FullLibrary from '#src/plugins/official/media/library/database/library/FullLibrary.js';
import MediaDirectoryDetector from '#src/plugins/official/media/library/scanner/MediaDirectoryDetector.js';
import MediaLibraryScanner from '#src/plugins/official/media/library/scanner/MediaLibraryScanner.js';
import MovieDirectoryScanner from '#src/plugins/official/media/library/scanner/MovieDirectoryScanner.js';
import TvShowDirectoryScanner from '#src/plugins/official/media/library/scanner/TvShowDirectoryScanner.js';
import ApolloUser from '#src/user/ApolloUser.js';
import UserProvider from '#src/user/UserProvider.js';
import { createStrictDeepMock, createTemporaryTestDirectory } from '#tests/test-helpers.js';

const CODE_GEASS = 'Anime/Code Geass (2006)';
const ARRIVAL = 'Movies/Arrival (2016)';
const DAY_IN_MS = 24 * 60 * 60 * 1000;

describe(MediaLibraryScanner, () => {
  let databaseClient: DatabaseClient;
  let alice: ApolloUser;
  let hostRoot: string;
  let fileSystem: LocalFileSystem;
  let unprobeablePaths: Set<string>;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let library: FullLibrary;
  let scanner: MediaLibraryScanner;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    const aliceId = (await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id;
    alice = new ApolloUser(aliceId, 'Alice', false, false, null);

    hostRoot = await createTemporaryTestDirectory();
    fileSystem = new LocalFileSystem('default', alice, { fs_local: { pathOnHost: hostRoot } });
    await createFiles(
      `${CODE_GEASS}/Season 01/S01E01.mkv`,
      `${CODE_GEASS}/Season 01/S01E02.mkv`,
      `${CODE_GEASS}/Season 01/S01E03.mkv`,
      `${ARRIVAL}/Arrival (2016).mkv`,
    );

    unprobeablePaths = new Set();
    const ffprobe = createStrictDeepMock<CachedFfprobe>();
    ffprobe.probeFull.mockImplementation(async (file: LocalFile) => probeOrFail(file.getAbsolutePathOnHost()));
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const fileProvider = createStrictDeepMock<PermissionAwareFileProvider>();
    fileProvider.provideForRead.mockImplementation(async (uri) => fileSystem.getFile(uri.filePath));

    const tvShowScanner = new TvShowDirectoryScanner(ffprobe, new FileTypeUtils());
    const movieScanner = new MovieDirectoryScanner(ffprobe, new FileTypeUtils());
    scanner = new MediaLibraryScanner(
      new UserProvider(databaseClient),
      fileProvider,
      databaseClient,
      new MediaDirectoryDetector(tvShowScanner, movieScanner),
      tvShowScanner,
      movieScanner,
    );

    library = await createLibrary('/Anime', '/Movies');
    await scanner.scan(library);
  });

  afterEach(async () => {
    await Fs.promises.chmod(Path.join(hostRoot, CODE_GEASS, 'Season 01'), 0o755).catch(() => undefined);
    await databaseClient.authUser.delete({ where: { id: alice.id } });
  });

  async function createFiles(...relativePaths: string[]): Promise<void> {
    for (const relativePath of relativePaths) {
      await Fs.promises.mkdir(Path.dirname(Path.join(hostRoot, relativePath)), { recursive: true });
      await Fs.promises.writeFile(Path.join(hostRoot, relativePath), 'matroska video data');
    }
  }

  function probeOrFail(pathOnHost: string): FullProbeResult {
    if (unprobeablePaths.has(pathOnHost)) {
      throw new Error(`ffprobe exited with code 1: '${pathOnHost}': Invalid data found when processing input`);
    }
    return {
      format: {
        filename: pathOnHost,
        nb_streams: 0,
        nb_programs: 0,
        format_name: 'matroska,webm',
        format_long_name: 'Matroska / WebM',
        duration: '1440.000000',
        probe_score: 100,
        tags: {},
      },
      streams: [],
      chapters: [],
    };
  }

  async function createLibrary(...directoryPaths: string[]): Promise<FullLibrary> {
    const directoryUris = directoryPaths.map((path) => fileSystem.getFile(path).toURI().toString());
    const row = await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Library', directoryUris } });
    return new FullLibrary(row.id, alice.id, row.name, directoryUris, []);
  }

  /** Only items users can see, i.e. not missing ones */
  async function itemIdOf(mediaDirectory: string, relativeFilePath: string): Promise<bigint | null> {
    const item = await databaseClient.mediaLibraryMediaItem.findFirst({
      where: { relativeFilePath, missingSince: null, media: { libraryId: library.id, directoryUri: fileSystem.getFile(`/${mediaDirectory}`).toURI().toString() } },
      select: { id: true },
    });
    return item?.id ?? null;
  }

  /** Only items users can see, i.e. not missing ones */
  async function itemPathsOf(mediaDirectory: string): Promise<string[]> {
    const items = await databaseClient.mediaLibraryMediaItem.findMany({
      where: { missingSince: null, media: { libraryId: library.id, directoryUri: fileSystem.getFile(`/${mediaDirectory}`).toURI().toString() } },
      select: { relativeFilePath: true },
    });
    return items.map((item) => item.relativeFilePath).sort();
  }

  async function markMissingDaysAgo(itemId: bigint | null, days: number): Promise<void> {
    await databaseClient.mediaLibraryMediaItem.update({ where: { id: itemId! }, data: { missingSince: new Date(Date.now() - days * DAY_IN_MS) } });
  }

  async function itemExists(itemId: bigint | null): Promise<boolean> {
    return (await databaseClient.mediaLibraryMediaItem.count({ where: { id: itemId! } })) > 0;
  }

  async function saveProgress(itemId: bigint | null, durationInSec: number): Promise<void> {
    await databaseClient.mediaLibraryUserWatchProgress.create({ data: { userId: alice.id, mediaItemId: itemId!, durationInSec } });
  }

  async function progressOf(itemId: bigint | null): Promise<number | null> {
    const row = await databaseClient.mediaLibraryUserWatchProgress.findUnique({ where: { userId_mediaItemId: { userId: alice.id, mediaItemId: itemId! } } });
    return row?.durationInSec ?? null;
  }

  describe('when an episode file was deleted', () => {
    let episodeThreeId: bigint | null;

    beforeEach(async () => {
      episodeThreeId = await itemIdOf(CODE_GEASS, 'Season 01/S01E03.mkv');
      await saveProgress(episodeThreeId, 754);
      await Fs.promises.rm(Path.join(hostRoot, CODE_GEASS, 'Season 01/S01E03.mkv'));
    });

    test('Hides its item', async () => {
      await scanner.scan(library);

      await expect(itemPathsOf(CODE_GEASS)).resolves.toEqual(['Season 01/S01E01.mkv', 'Season 01/S01E02.mkv']);
    });

    test('Keeps the hidden item and the watch progress on it', async () => {
      await scanner.scan(library);

      await expect(itemExists(episodeThreeId)).resolves.toBe(true);
      await expect(progressOf(episodeThreeId)).resolves.toBe(754);
    });

    test('Shows the same item with its watch progress again once the file is back', async () => {
      await scanner.scan(library);
      await createFiles(`${CODE_GEASS}/Season 01/S01E03.mkv`);

      await scanner.scan(library);

      await expect(itemIdOf(CODE_GEASS, 'Season 01/S01E03.mkv')).resolves.toBe(episodeThreeId);
      await expect(progressOf(episodeThreeId)).resolves.toBe(754);
    });

    test('Does not restart the grace period on later scans', async () => {
      await markMissingDaysAgo(episodeThreeId, 10);
      const missingSince = (await databaseClient.mediaLibraryMediaItem.findUniqueOrThrow({ where: { id: episodeThreeId! } })).missingSince;

      await scanner.scan(library);

      await expect(databaseClient.mediaLibraryMediaItem.findUniqueOrThrow({ where: { id: episodeThreeId! } }))
        .resolves.toMatchObject({ missingSince });
    });

    test('Keeps the item while it has been missing for less than 14 days', async () => {
      await markMissingDaysAgo(episodeThreeId, 13);

      await scanner.scan(library);

      await expect(itemExists(episodeThreeId)).resolves.toBe(true);
    });

    test('Deletes the item once it has been missing for more than 14 days', async () => {
      await markMissingDaysAgo(episodeThreeId, 15);

      await scanner.scan(library);

      await expect(itemExists(episodeThreeId)).resolves.toBe(false);
    });
  });

  test('Deletes a movie whose directory has been gone for more than 14 days', async () => {
    await markMissingDaysAgo(await itemIdOf(ARRIVAL, 'Arrival (2016).mkv'), 15);
    await Fs.promises.rm(Path.join(hostRoot, ARRIVAL), { recursive: true });

    await scanner.scan(library);

    await expect(databaseClient.mediaLibraryMedia.count({ where: { libraryId: library.id, title: 'Arrival' } })).resolves.toBe(0);
  });

  describe('when an episode file cannot be probed', () => {
    let episodeTwoId: bigint | null;

    beforeEach(async () => {
      episodeTwoId = await itemIdOf(CODE_GEASS, 'Season 01/S01E02.mkv');
      await saveProgress(episodeTwoId, 754);
      unprobeablePaths.add(Path.join(hostRoot, CODE_GEASS, 'Season 01/S01E02.mkv'));
    });

    test('Keeps its item and the watch progress on it', async () => {
      await scanner.scan(library);

      await expect(itemIdOf(CODE_GEASS, 'Season 01/S01E02.mkv')).resolves.toBe(episodeTwoId);
      await expect(progressOf(episodeTwoId)).resolves.toBe(754);
    });

    test('Still adds the new episodes next to it', async () => {
      await createFiles(`${CODE_GEASS}/Season 01/S01E04.mkv`, `${CODE_GEASS}/Season 01/S01E05.mkv`);

      await scanner.scan(library);

      await expect(itemPathsOf(CODE_GEASS)).resolves.toEqual([
        'Season 01/S01E01.mkv',
        'Season 01/S01E02.mkv',
        'Season 01/S01E03.mkv',
        'Season 01/S01E04.mkv',
        'Season 01/S01E05.mkv',
      ]);
    });

    test('Logs the file it could not scan', async () => {
      await scanner.scan(library);

      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Season%2001/S01E02.mkv'), expect.any(Error));
    });
  });

  test('Keeps a movie and the watch progress on it when its file cannot be probed', async () => {
    const arrivalId = await itemIdOf(ARRIVAL, 'Arrival (2016).mkv');
    await saveProgress(arrivalId, 3600);
    unprobeablePaths.add(Path.join(hostRoot, ARRIVAL, 'Arrival (2016).mkv'));

    await scanner.scan(library);

    await expect(itemIdOf(ARRIVAL, 'Arrival (2016).mkv')).resolves.toBe(arrivalId);
    await expect(progressOf(arrivalId)).resolves.toBe(3600);
  });

  test('Keeps a show and the watch progress on it when its directory cannot be read', async ({ skip }) => {
    skip(process.getuid?.() === 0, 'root reads the directory regardless of its permissions');
    const episodeOneId = await itemIdOf(CODE_GEASS, 'Season 01/S01E01.mkv');
    await saveProgress(episodeOneId, 1200);
    await Fs.promises.chmod(Path.join(hostRoot, CODE_GEASS, 'Season 01'), 0o000);

    await scanner.scan(library);

    await expect(itemIdOf(CODE_GEASS, 'Season 01/S01E01.mkv')).resolves.toBe(episodeOneId);
    await expect(progressOf(episodeOneId)).resolves.toBe(1200);
  });

  describe('when a library directory is not available', () => {
    beforeEach(async () => {
      await Fs.promises.rename(Path.join(hostRoot, 'Anime'), Path.join(hostRoot, 'Anime (unmounted)'));
    });

    test('Keeps its media and the watch progress on them', async () => {
      const episodeOneId = await itemIdOf(CODE_GEASS, 'Season 01/S01E01.mkv');
      await saveProgress(episodeOneId, 1200);

      await scanner.scan(library);

      await expect(itemPathsOf(CODE_GEASS)).resolves.toEqual(['Season 01/S01E01.mkv', 'Season 01/S01E02.mkv', 'Season 01/S01E03.mkv']);
      await expect(progressOf(episodeOneId)).resolves.toBe(1200);
    });

    test('Still hides deleted items in the library\'s other directories', async () => {
      await Fs.promises.rm(Path.join(hostRoot, ARRIVAL), { recursive: true });

      await scanner.scan(library);

      await expect(itemPathsOf(ARRIVAL)).resolves.toEqual([]);
    });

    test('Does not delete its media however long it has been gone', async () => {
      const episodeOneId = await itemIdOf(CODE_GEASS, 'Season 01/S01E01.mkv');
      await markMissingDaysAgo(episodeOneId, 15);

      await scanner.scan(library);

      await expect(itemExists(episodeOneId)).resolves.toBe(true);
    });

    test('Logs the directory as unavailable', async () => {
      await scanner.scan(library);

      expect(consoleError).toHaveBeenCalledWith(expect.stringMatching(/Library directory '.*\/Anime' is not available/));
    });
  });
});
