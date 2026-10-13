import { AppCache } from '#src/cache/AppCache.js';
import { CacheCodecs } from '#src/cache/CacheCodec.js';
import { CacheRootError } from '#src/cache/error/CacheRootError.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import type { CacheIndexWrite } from '#src/cache/internal/database/CacheIndexWrite.js';
import { CacheStartupCheck } from '#src/cache/maintenance/CacheStartupCheck.js';
import { UnknownCacheNamespaceFinder } from '#src/cache/maintenance/UnknownCacheNamespaceFinder.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import type { MockInstance } from 'vitest';

class RetiredPluginCache extends AppCache<string> {
  constructor(services: CacheServices, namespace: string) {
    super(services, { namespace, version: 1, codec: CacheCodecs.text(), expiry: 'never' });
  }
}

describe(CacheStartupCheck, () => {
  let databaseClient: DatabaseClient;
  let tmpDir: string;
  let cacheRoot: string;
  let services: CacheServices;
  let unknownCacheNamespaceFinder: UnknownCacheNamespaceFinder;
  let unknownNamespace: string;
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    cacheRoot = Path.join(tmpDir, 'cache');
    unknownNamespace = `retired-plugin.metadata.${Crypto.randomUUID()}`;
    ({ services } = createCacheTestServices(databaseClient, cacheRoot));
    unknownCacheNamespaceFinder = new UnknownCacheNamespaceFinder(databaseClient, services.cacheNamespaceRegistry);
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    // run() starts the scan without awaiting it
    await unknownCacheNamespaceFinder.find().catch(() => undefined);
    // One test makes the cache directory read-only, which would keep it from being removed
    await Fs.promises.chmod(cacheRoot, 0o755).catch(() => undefined);
    await databaseClient.cacheAppEntry.deleteMany({ where: { namespace: unknownNamespace } });
  });

  function createCheck(): CacheStartupCheck {
    return new CacheStartupCheck(services.cacheFileStorage, unknownCacheNamespaceFinder);
  }

  function createWrite(overrides: Partial<CacheIndexWrite>): CacheIndexWrite {
    return {
      namespace: unknownNamespace,
      version: 1,
      key: '17',
      groupKey: null,
      validator: null,
      payload: { fileId: Crypto.randomUUID(), sizeBytes: 1_048_576, contentType: null },
      writtenAt: new Date('2026-10-01T08:00:00Z'),
      freshUntil: null,
      keepUntil: null,
      ...overrides,
    };
  }

  describe('claiming the cache directory', () => {
    test('Creates a missing cache directory with the marker file', async () => {
      await createCheck().run();

      await expect(services.cacheFileStorage.hasRootMarker()).resolves.toBe(true);
    });

    test('Writes the marker file into an empty cache directory', async () => {
      await Fs.promises.mkdir(cacheRoot);

      await createCheck().run();

      await expect(services.cacheFileStorage.hasRootMarker()).resolves.toBe(true);
    });

    test('Accepts a non-empty cache directory with the marker file', async () => {
      await Fs.promises.mkdir(Path.join(cacheRoot, 'app'), { recursive: true });
      await services.cacheFileStorage.createRootMarker();

      await expect(createCheck().run()).resolves.toBeUndefined();
    });

    test('Refuses a non-empty directory without the marker file, naming the directory', async () => {
      await Fs.promises.mkdir(Path.join(cacheRoot, 'expiring'), { recursive: true });

      await expect(createCheck().run()).rejects.toThrow(CacheRootError);
      await expect(createCheck().run()).rejects.toThrow(`The cache directory '${cacheRoot}' is not empty`);
    });

    test('Leaves a refused directory untouched', async () => {
      await Fs.promises.mkdir(Path.join(cacheRoot, 'expiring'), { recursive: true });

      await createCheck().run().catch(() => undefined);

      await expect(Fs.promises.readdir(cacheRoot)).resolves.toEqual(['expiring']);
    });
  });

  test('Clears leftover temp files', async () => {
    await Fs.promises.mkdir(Path.join(cacheRoot, '.tmp'), { recursive: true });
    await services.cacheFileStorage.createRootMarker();
    await Fs.promises.writeFile(Path.join(cacheRoot, '.tmp', '3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47'), 'half a thumbnail');

    await createCheck().run();

    await expect(Fs.promises.readdir(Path.join(cacheRoot, '.tmp'))).resolves.toEqual([]);
  });

  describe('when the cache directory is not usable', () => {
    test('Refuses a directory that cannot be created, naming the directory and the cause', async () => {
      const unusableRoot = Path.join(tmpDir, 'not-a-directory', 'cache');
      await Fs.promises.writeFile(Path.join(tmpDir, 'not-a-directory'), '');
      ({ services } = createCacheTestServices(databaseClient, unusableRoot));

      await expect(createCheck().run()).rejects.toThrow(expect.objectContaining({
        name: 'CacheRootError',
        message: expect.stringContaining(`The cache directory '${unusableRoot}' is not usable`),
        cause: expect.objectContaining({ code: 'ENOTDIR' }),
      }));
    });

    test('Refuses a directory that is not writable, naming the directory and the cause', async () => {
      await Fs.promises.mkdir(Path.join(cacheRoot, '.tmp'), { recursive: true });
      await services.cacheFileStorage.createRootMarker();
      await Fs.promises.chmod(cacheRoot, 0o555);

      await expect(createCheck().run()).rejects.toThrow(expect.objectContaining({
        name: 'CacheRootError',
        message: expect.stringContaining(`The cache directory '${cacheRoot}' is not usable`),
        cause: expect.objectContaining({ code: 'EACCES' }),
      }));
    });
  });

  describe('unknown namespaces', () => {
    test('Warns about a namespace no registered cache uses, with its size and deletion date', async () => {
      await services.appCacheIndex.upsertReturningPrevious(createWrite({ key: '17', writtenAt: new Date('2026-09-01T08:00:00Z') }));
      await services.appCacheIndex.upsertReturningPrevious(createWrite({ key: '18', writtenAt: new Date('2026-10-01T08:00:00Z') }));

      await createCheck().run();
      await unknownCacheNamespaceFinder.find();

      expect(consoleWarn).toHaveBeenCalledWith(expect.stringMatching(
        new RegExp(`'${unknownNamespace}' \\(2\\.0 MiB\\).*after 2026-10-31T08:00:00\\.000Z`),
      ));
    });

    test('Does not warn about a namespace a registered cache uses', async () => {
      await services.appCacheIndex.upsertReturningPrevious(createWrite({}));
      new RetiredPluginCache(services, unknownNamespace);

      await createCheck().run();
      await unknownCacheNamespaceFinder.find();

      expect(consoleWarn).not.toHaveBeenCalledWith(expect.stringContaining(unknownNamespace));
    });
  });
});
