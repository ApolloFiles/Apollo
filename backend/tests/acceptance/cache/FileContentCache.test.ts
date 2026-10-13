import { CacheCodecs } from '#src/cache/CacheCodec.js';
import type { CacheFactory } from '#src/cache/CacheFactory.js';
import { CacheScopeError } from '#src/cache/error/CacheScopeError.js';
import { FileContentCache } from '#src/cache/FileContentCache.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import type LocalFile from '#src/files/local/LocalFile.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import type { Mock } from 'vitest';

class ThumbnailCache extends FileContentCache<Buffer> {
  constructor(services: CacheServices, namespace: string) {
    super(services, { namespace, version: 1, codec: CacheCodecs.bytes(), expiry: 'never' });
  }
}

const AVIF_BYTES = Buffer.from('avif bytes from ffmpeg');
const JPEG_BYTES = Buffer.from('jpeg bytes from sharp');

describe(FileContentCache, () => {
  let databaseClient: DatabaseClient;
  let alice: ApolloUser;
  let tmpDir: string;
  let namespace: string;
  let fileSystem: LocalFileSystem;
  let video: LocalFile;
  let cache: ThumbnailCache;

  beforeAll(async () => {
    databaseClient = new DatabaseClient();
    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
  });

  afterAll(async () => {
    await databaseClient.authUser.delete({ where: { id: alice.id } });
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    namespace = `media.thumbnail.${Crypto.randomUUID()}`;
    const { services } = createCacheTestServices(databaseClient, Path.join(tmpDir, 'cache'));
    cache = new ThumbnailCache(services, namespace);

    fileSystem = createFileSystem('default', alice);
    await Fs.promises.mkdir(Path.join(tmpDir, 'default', 'movies'), { recursive: true });
    await Fs.promises.writeFile(Path.join(tmpDir, 'default', 'movies', 'Arrival.mkv'), 'matroska video data');
    video = fileSystem.getFile('/movies/Arrival.mkv');
  });

  afterEach(async () => {
    await databaseClient.cacheUserEntry.deleteMany({ where: { namespace } });
  });

  function createFileSystem(id: string, owner: ApolloUser | null): LocalFileSystem {
    return new LocalFileSystem(id, owner, { fs_local: { pathOnHost: Path.join(tmpDir, id) } });
  }

  test('Returns an entry it created for an unchanged file', async () => {
    await using _created = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);

    await using entry = await cache.get(video, 'avif');

    await expect(entry!.value()).resolves.toEqual(AVIF_BYTES);
  });

  test('Does not call the factory again for an unchanged file', async () => {
    await using _created = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);
    const factory: Mock<CacheFactory<Buffer>> = vi.fn();

    await using _entry = await cache.getOrCreate(video, 'avif', factory);

    expect(factory).not.toHaveBeenCalled();
  });

  test('Misses once the file\'s content changed', async () => {
    await using _created = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);
    await Fs.promises.writeFile(Path.join(tmpDir, 'default', 'movies', 'Arrival.mkv'), 'a different, re-encoded video');

    await expect(cache.get(video, 'avif')).resolves.toBeUndefined();
  });

  test('Misses once the file\'s modification time changed, even at the same size', async () => {
    await using _created = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);
    await Fs.promises.utimes(Path.join(tmpDir, 'default', 'movies', 'Arrival.mkv'), new Date('2026-10-12T10:00:00Z'), new Date('2026-10-12T10:00:00Z'));

    await expect(cache.get(video, 'avif')).resolves.toBeUndefined();
  });

  test('Keeps entries of one file under different entry names apart', async () => {
    await using _avif = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);
    await using _jpeg = await cache.getOrCreate(video, 'jpeg', async () => JPEG_BYTES);

    await using entry = await cache.get(video, 'jpeg');

    await expect(entry!.value()).resolves.toEqual(JPEG_BYTES);
  });

  test('Keeps the same path in two file systems of one owner apart', async () => {
    const archive = createFileSystem('nas-archive', alice);
    await Fs.promises.mkdir(Path.join(tmpDir, 'nas-archive', 'movies'), { recursive: true });
    await Fs.promises.writeFile(Path.join(tmpDir, 'nas-archive', 'movies', 'Arrival.mkv'), 'matroska video data');
    await using _created = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);

    await expect(cache.get(archive.getFile('/movies/Arrival.mkv'), 'avif')).resolves.toBeUndefined();
  });

  test('Stores the entry in the file system owner\'s cache, grouped by the file', async () => {
    await using _created = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);

    const row = await databaseClient.cacheUserEntry.findFirstOrThrow({ where: { namespace } });
    expect(row).toMatchObject({ userId: alice.id, key: 'default:/movies/Arrival.mkv|avif', groupKey: 'default:/movies/Arrival.mkv' });
  });

  test('Misses after deleting the entry', async () => {
    await using _created = await cache.getOrCreate(video, 'avif', async () => AVIF_BYTES);

    await cache.delete(video, 'avif');

    await expect(cache.get(video, 'avif')).resolves.toBeUndefined();
  });

  test('Rejects files of a file system without an owner', async () => {
    const systemFile = createFileSystem('_tmp', null).getFile('/movies/Arrival.mkv');

    await expect(cache.get(systemFile, 'avif')).rejects.toThrow(new CacheScopeError('File system \'_tmp\' has no owner, so there is no user cache for its files'));
  });

  test('Rejects an invalid entry name', async () => {
    await expect(cache.get(video, 'thumbnail|avif')).rejects.toThrow('Invalid cache entry name \'thumbnail|avif\'');
  });

  test('Misses when the file does not exist', async () => {
    await expect(cache.get(fileSystem.getFile('/movies/Missing.mkv'), 'avif')).resolves.toBeUndefined();
  });

  test('Rejects creating an entry for a file that does not exist', async () => {
    await expect(cache.getOrCreate(fileSystem.getFile('/movies/Missing.mkv'), 'avif', async () => AVIF_BYTES))
      .rejects.toThrow(expect.objectContaining({ code: 'ENOENT' }));
  });
});
