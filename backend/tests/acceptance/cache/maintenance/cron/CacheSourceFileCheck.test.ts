import { CacheCodecs } from '#src/cache/CacheCodec.js';
import { FileContentCache } from '#src/cache/FileContentCache.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import { CacheSourceFileCheck } from '#src/cache/maintenance/cron/CacheSourceFileCheck.js';
import { UserCache } from '#src/cache/UserCache.js';
import type ApolloDirectoryProvider from '#src/config/ApolloDirectoryProvider.js';
import type DatabaseClient from '#src/database/DatabaseClient.js';
import FileSystemProvider from '#src/files/FileSystemProvider.js';
import type LocalFile from '#src/files/local/LocalFile.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';
import ApolloUser from '#src/user/ApolloUser.js';
import UserProvider from '#src/user/UserProvider.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createIsolatedDatabaseClient } from '#tests/acceptance/IsolatedDatabaseClient.js';
import { createStrictDeepMock, createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Fs from 'node:fs';
import Path from 'node:path';
import type { MockInstance } from 'vitest';

class ThumbnailCache extends FileContentCache<Buffer> {
  constructor(services: CacheServices) {
    super(services, { namespace: 'media.thumbnail', version: 1, codec: CacheCodecs.bytes(), expiry: 'never' });
  }
}

class WatchNotesCache extends UserCache<string> {
  constructor(services: CacheServices) {
    super(services, { namespace: 'media.watch-notes', version: 1, codec: CacheCodecs.text(), expiry: 'never' });
  }
}

describe(CacheSourceFileCheck, () => {
  let databaseClient: DatabaseClient;
  let disposeDatabase: () => Promise<void>;
  let alice: ApolloUser;
  let bob: ApolloUser;
  let tmpDir: string;
  let services: CacheServices;
  let thumbnailCache: ThumbnailCache;
  let watchNotesCache: WatchNotesCache;
  let consoleWarn: MockInstance<typeof console.warn>;
  let check: CacheSourceFileCheck;

  beforeAll(async () => {
    // The check works across all users' entries, so it gets a database of its own
    ({ databaseClient, dispose: disposeDatabase } = await createIsolatedDatabaseClient());
    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    bob = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Bob' } })).id, 'Bob', false, false, null);
  });

  afterAll(async () => {
    await disposeDatabase();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    ({ services } = createCacheTestServices(databaseClient, Path.join(tmpDir, 'cache')));
    thumbnailCache = new ThumbnailCache(services);
    watchNotesCache = new WatchNotesCache(services);

    const directoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
    directoryProvider.getUserFileSystemDirectory.mockImplementation((userId) => Path.join(tmpDir, 'users', userId, 'fs'));
    directoryProvider.getUserTemporaryDirectory.mockImplementation((userId) => Path.join(tmpDir, 'users', userId, 'tmp'));

    check = new CacheSourceFileCheck(
      databaseClient,
      services.cacheNamespaceRegistry,
      new UserProvider(databaseClient),
      new FileSystemProvider(directoryProvider),
      services.userCacheIndex,
      services.cacheEntryDeleter,
    );
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await databaseClient.cacheUserEntry.deleteMany();
  });

  function getFileSystem(user: ApolloUser, id = 'default'): LocalFileSystem {
    return new LocalFileSystem(id, user, { fs_local: { pathOnHost: Path.join(tmpDir, 'users', user.id, 'fs', id) } });
  }

  async function createVideo(fileSystem: LocalFileSystem, path: string): Promise<LocalFile> {
    const file = fileSystem.getFile(path);
    await Fs.promises.mkdir(Path.dirname(file.getAbsolutePathOnHost()), { recursive: true });
    await Fs.promises.writeFile(file.getAbsolutePathOnHost(), 'matroska video data');
    return file;
  }

  async function cacheThumbnail(file: LocalFile): Promise<void> {
    await using _entry = await thumbnailCache.getOrCreate(file, 'avif', async () => Buffer.from('avif of Arrival'));
  }

  async function remainingGroupKeys(user: ApolloUser): Promise<string[]> {
    const entries = await databaseClient.cacheUserEntry.findMany({ where: { userId: user.id }, select: { groupKey: true } });
    return entries.map((entry) => entry.groupKey!).sort();
  }

  async function countStoredFiles(user: ApolloUser): Promise<number> {
    const entries = await Fs.promises.readdir(Path.join(tmpDir, 'cache', 'user', user.id), { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).length;
  }

  test('Deletes the entries of a source file that no longer exists, together with their stored files', async () => {
    const arrival = await createVideo(getFileSystem(alice), '/movies/Arrival.mkv');
    await cacheThumbnail(arrival);
    await Fs.promises.rm(arrival.getAbsolutePathOnHost());

    await check.run();

    await expect(remainingGroupKeys(alice)).resolves.toEqual([]);
    await expect(countStoredFiles(alice)).resolves.toBe(0);
  });

  test('Keeps the entries of a source file that still exists', async () => {
    await cacheThumbnail(await createVideo(getFileSystem(alice), '/movies/Arrival.mkv'));
    const sicario = await createVideo(getFileSystem(alice), '/movies/Sicario.mkv');
    await cacheThumbnail(sicario);
    await Fs.promises.rm(sicario.getAbsolutePathOnHost());

    await check.run();

    await expect(remainingGroupKeys(alice)).resolves.toEqual(['default:/movies/Arrival.mkv']);
  });

  test('Deletes the entries of a file whose directory was replaced by a file', async () => {
    await createVideo(getFileSystem(alice), '/movies/Sicario.mkv');
    const arrival = await createVideo(getFileSystem(alice), '/movies/Arrival (2016)/Arrival.mkv');
    await cacheThumbnail(arrival);
    await Fs.promises.rm(Path.dirname(arrival.getAbsolutePathOnHost()), { recursive: true });
    await Fs.promises.writeFile(Path.dirname(arrival.getAbsolutePathOnHost()), 'not a directory');

    await check.run();

    await expect(remainingGroupKeys(alice)).resolves.toEqual([]);
  });

  test('Checks each user\'s entries against that user\'s own file systems', async () => {
    const alicesArrival = await createVideo(getFileSystem(alice), '/movies/Arrival.mkv');
    await createVideo(getFileSystem(alice), '/movies/Sicario.mkv');
    await cacheThumbnail(alicesArrival);
    await cacheThumbnail(await createVideo(getFileSystem(bob), '/movies/Arrival.mkv'));
    await Fs.promises.rm(alicesArrival.getAbsolutePathOnHost());

    await check.run();

    await expect(remainingGroupKeys(alice)).resolves.toEqual([]);
    await expect(remainingGroupKeys(bob)).resolves.toEqual(['default:/movies/Arrival.mkv']);
  });

  test('Leaves the entries of plain user caches alone, even with a group key of a missing file', async () => {
    await createVideo(getFileSystem(alice), '/movies/Sicario.mkv');
    await watchNotesCache.forUser(alice).set('arrival-notes', 'Rewatch the ending', { groupKey: 'default:/movies/Arrival.mkv' });

    await check.run();

    await expect(remainingGroupKeys(alice)).resolves.toEqual(['default:/movies/Arrival.mkv']);
  });

  describe('when a file system looks unavailable', () => {
    test('Keeps the entries of a file system that no longer exists, and warns', async () => {
      await createVideo(getFileSystem(alice), '/movies/Sicario.mkv');
      const arrival = await createVideo(getFileSystem(alice, 'nas'), '/movies/Arrival.mkv');
      await cacheThumbnail(arrival);
      await Fs.promises.rm(getFileSystem(alice, 'nas').getAbsolutePathOnHost(), { recursive: true });

      await check.run();

      await expect(remainingGroupKeys(alice)).resolves.toEqual(['nas:/movies/Arrival.mkv']);
      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('\'nas\' of user'));
    });

    test('Keeps the entries of an empty file system, which may be an unmounted share, and warns', async () => {
      const arrival = await createVideo(getFileSystem(alice, 'nas'), '/movies/Arrival.mkv');
      await cacheThumbnail(arrival);
      await Fs.promises.rm(Path.join(getFileSystem(alice, 'nas').getAbsolutePathOnHost(), 'movies'), { recursive: true });

      await check.run();

      await expect(remainingGroupKeys(alice)).resolves.toEqual(['nas:/movies/Arrival.mkv']);
      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('it is empty, so it may not be mounted'));
    });
  });
});
