import { CacheCodecs } from '#src/cache/CacheCodec.js';
import { FileContentCacheEventListener } from '#src/cache/event/FileContentCacheEventListener.js';
import { FileContentCache } from '#src/cache/FileContentCache.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import { UserCache } from '#src/cache/UserCache.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import type LocalFile from '#src/files/local/LocalFile.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';
import EventRegistry from '#src/plugins/builtin/event/EventRegistry.js';
import FileDeletedEvent from '#src/plugins/builtin/event/events/FileDeletedEvent.js';
import FileRenamedEvent from '#src/plugins/builtin/event/events/FileRenamedEvent.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import type { MockInstance } from 'vitest';

class ThumbnailCache extends FileContentCache<Buffer> {
  constructor(services: CacheServices, namespace: string) {
    super(services, { namespace, version: 1, codec: CacheCodecs.bytes(), expiry: 'never' });
  }
}

class WatchNotesCache extends UserCache<string> {
  constructor(services: CacheServices, namespace: string) {
    super(services, { namespace, version: 1, codec: CacheCodecs.text(), expiry: 'never' });
  }
}

const ARRIVAL_AVIF = Buffer.from('avif of Arrival');
const SICARIO_AVIF = Buffer.from('avif of Sicario');

describe(FileContentCacheEventListener, () => {
  let databaseClient: DatabaseClient;
  let alice: ApolloUser;
  let bob: ApolloUser;
  let tmpDir: string;
  let cacheRoot: string;
  let thumbnailNamespace: string;
  let watchNotesNamespace: string;
  let services: CacheServices;
  let thumbnailCache: ThumbnailCache;
  let watchNotesCache: WatchNotesCache;
  let eventRegistry: EventRegistry;
  let aliceFileSystem: LocalFileSystem;
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeAll(async () => {
    databaseClient = new DatabaseClient();
    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    bob = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Bob' } })).id, 'Bob', false, false, null);
  });

  afterAll(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    cacheRoot = Path.join(tmpDir, 'cache');
    thumbnailNamespace = `media.thumbnail.${Crypto.randomUUID()}`;
    watchNotesNamespace = `media.watch-notes.${Crypto.randomUUID()}`;
    ({ services } = createCacheTestServices(databaseClient, cacheRoot));

    thumbnailCache = new ThumbnailCache(services, thumbnailNamespace);
    watchNotesCache = new WatchNotesCache(services, watchNotesNamespace);

    eventRegistry = new EventRegistry();
    new FileContentCacheEventListener(eventRegistry, services.cacheNamespaceRegistry, services.userCacheIndex, services.cacheEntryDeleter);

    aliceFileSystem = createFileSystem('default', alice);
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await databaseClient.cacheUserEntry.deleteMany({ where: { namespace: { in: [thumbnailNamespace, watchNotesNamespace] } } });
  });

  function createFileSystem(id: string, owner: ApolloUser | null): LocalFileSystem {
    return new LocalFileSystem(id, owner, { fs_local: { pathOnHost: Path.join(tmpDir, 'files', id) } });
  }

  async function createVideo(fileSystem: LocalFileSystem, path: string, content = 'matroska video data'): Promise<LocalFile> {
    const file = fileSystem.getFile(path);
    await Fs.promises.mkdir(Path.dirname(file.getAbsolutePathOnHost()), { recursive: true });
    await Fs.promises.writeFile(file.getAbsolutePathOnHost(), content);
    return file;
  }

  async function cacheThumbnail(file: LocalFile, thumbnail = ARRIVAL_AVIF): Promise<void> {
    await using _entry = await thumbnailCache.getOrCreate(file, 'avif', async () => thumbnail);
  }

  async function renameOnDiskAndEmit(oldFile: LocalFile, newFile: LocalFile): Promise<void> {
    await Fs.promises.mkdir(Path.dirname(newFile.getAbsolutePathOnHost()), { recursive: true });
    await Fs.promises.rename(oldFile.getAbsolutePathOnHost(), newFile.getAbsolutePathOnHost());
    await eventRegistry.for(FileRenamedEvent).emit(new FileRenamedEvent(oldFile, newFile));
  }

  async function listStoredFiles(user: ApolloUser): Promise<string[]> {
    const entries = await Fs.promises.readdir(Path.join(cacheRoot, 'user', user.id), { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  }

  async function readThumbnail(file: LocalFile): Promise<Buffer | null | undefined> {
    await using entry = await thumbnailCache.get(file, 'avif');
    return entry?.value();
  }

  describe('when a file is deleted', () => {
    test('Removes the entries of the file', async () => {
      const video = await createVideo(aliceFileSystem, '/movies/Arrival.mkv');
      await cacheThumbnail(video);

      await eventRegistry.for(FileDeletedEvent).emit(new FileDeletedEvent(video));

      await expect(readThumbnail(video)).resolves.toBeUndefined();
    });

    test('Removes the stored files of its entries', async () => {
      const video = await createVideo(aliceFileSystem, '/movies/Arrival.mkv');
      await cacheThumbnail(video);

      await eventRegistry.for(FileDeletedEvent).emit(new FileDeletedEvent(video));

      await expect(listStoredFiles(alice)).resolves.toEqual([]);
    });

    test('Removes the entries of everything below a deleted directory, but not of a sibling with a longer name', async () => {
      const foo = await createVideo(aliceFileSystem, '/movies/Foo/Foo.mkv');
      const foobar = await createVideo(aliceFileSystem, '/movies/Foobar/Foobar.mkv');
      await cacheThumbnail(foo);
      await cacheThumbnail(foobar);

      await eventRegistry.for(FileDeletedEvent).emit(new FileDeletedEvent(aliceFileSystem.getFile('/movies/Foo')));

      await expect(readThumbnail(foo)).resolves.toBeUndefined();
      await expect(readThumbnail(foobar)).resolves.toEqual(ARRIVAL_AVIF);
    });

    test('Leaves entries of plain user caches alone, even with the same group key', async () => {
      const video = await createVideo(aliceFileSystem, '/movies/Arrival.mkv');
      await watchNotesCache.forUser(alice).set('arrival-notes', 'Rewatch the ending', { groupKey: 'default:/movies/Arrival.mkv' });

      await eventRegistry.for(FileDeletedEvent).emit(new FileDeletedEvent(video));

      await using entry = await watchNotesCache.forUser(alice).get('arrival-notes');
      await expect(entry?.value()).resolves.toBe('Rewatch the ending');
    });

    test('Ignores files of a file system without an owner', async () => {
      const systemFile = createFileSystem('_tmp', null).getFile('/movies/Arrival.mkv');

      await eventRegistry.for(FileDeletedEvent).emit(new FileDeletedEvent(systemFile));

      expect(consoleWarn).not.toHaveBeenCalled();
    });
  });

  describe('when a file is renamed', () => {
    test('Keeps its entries under the new path', async () => {
      const video = await createVideo(aliceFileSystem, '/downloads/Arrival.mkv');
      await cacheThumbnail(video);

      await renameOnDiskAndEmit(video, aliceFileSystem.getFile('/movies/Arrival (2016)/Arrival.mkv'));

      await expect(readThumbnail(aliceFileSystem.getFile('/movies/Arrival (2016)/Arrival.mkv'))).resolves.toEqual(ARRIVAL_AVIF);
    });

    test('Keeps the stored file of the entry, without rewriting it', async () => {
      const video = await createVideo(aliceFileSystem, '/downloads/Arrival.mkv');
      await cacheThumbnail(video);
      const storedFilesBefore = await listStoredFiles(alice);

      await renameOnDiskAndEmit(video, aliceFileSystem.getFile('/movies/Arrival.mkv'));

      await expect(listStoredFiles(alice)).resolves.toEqual(storedFilesBefore);
    });

    test('Moves the entries of everything below a renamed directory', async () => {
      const video = await createVideo(aliceFileSystem, '/downloads/Arrival (2016)/Arrival.mkv');
      await cacheThumbnail(video);

      await renameOnDiskAndEmit(aliceFileSystem.getFile('/downloads/Arrival (2016)'), aliceFileSystem.getFile('/movies/Arrival (2016)'));

      await expect(readThumbnail(aliceFileSystem.getFile('/movies/Arrival (2016)/Arrival.mkv'))).resolves.toEqual(ARRIVAL_AVIF);
    });

    test('Replaces the entries of a file it overwrites', async () => {
      const arrival = await createVideo(aliceFileSystem, '/downloads/Arrival.mkv');
      const sicario = await createVideo(aliceFileSystem, '/movies/Sicario.mkv', 'other matroska video data');
      await cacheThumbnail(arrival, ARRIVAL_AVIF);
      await cacheThumbnail(sicario, SICARIO_AVIF);

      await renameOnDiskAndEmit(arrival, sicario);

      await expect(readThumbnail(sicario)).resolves.toEqual(ARRIVAL_AVIF);
    });

    test('Deletes the stored files of the entries it replaces', async () => {
      const arrival = await createVideo(aliceFileSystem, '/downloads/Arrival.mkv');
      const sicario = await createVideo(aliceFileSystem, '/movies/Sicario.mkv', 'other matroska video data');
      await cacheThumbnail(arrival, ARRIVAL_AVIF);
      await cacheThumbnail(sicario, SICARIO_AVIF);

      await renameOnDiskAndEmit(arrival, sicario);

      await expect(listStoredFiles(alice)).resolves.toHaveLength(1);
    });

    test('Deletes the entries when the file moves to another owner', async () => {
      const video = await createVideo(aliceFileSystem, '/movies/Arrival.mkv');
      await cacheThumbnail(video);

      await eventRegistry.for(FileRenamedEvent).emit(new FileRenamedEvent(video, createFileSystem('bobs-default', bob).getFile('/movies/Arrival.mkv')));

      await expect(readThumbnail(video)).resolves.toBeUndefined();
    });
  });

  describe('when updating the caches fails', () => {
    beforeEach(() => {
      vi.spyOn(services.cacheEntryDeleter, 'deleteFilesOf').mockRejectedValue(new Error('EIO: i/o error'));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    test('Does not fail the file operation that emitted the event', async () => {
      const video = await createVideo(aliceFileSystem, '/movies/Arrival.mkv');

      await expect(eventRegistry.for(FileDeletedEvent).emit(new FileDeletedEvent(video))).resolves.toBeUndefined();
    });
  });
});
