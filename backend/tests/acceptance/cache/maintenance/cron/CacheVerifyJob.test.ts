import { type CacheFileLocation, CacheFileStorage } from '#src/cache/internal/CacheFileStorage.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import type { CacheIndexWrite } from '#src/cache/internal/database/CacheIndexWrite.js';
import { CacheVerifyJob } from '#src/cache/maintenance/cron/CacheVerifyJob.js';
import type DatabaseClient from '#src/database/DatabaseClient.js';
import {
  cacheFileExists,
  createCacheTestServices,
  findAllCacheKeys,
} from '#tests/acceptance/cache/CacheTestServices.js';
import { createIsolatedDatabaseClient } from '#tests/acceptance/IsolatedDatabaseClient.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import type { MockInstance } from 'vitest';

const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);

describe(CacheVerifyJob, () => {
  let databaseClient: DatabaseClient;
  let disposeDatabase: () => Promise<void>;
  let userId: string;
  let tmpDir: string;
  let cacheRoot: string;
  let services: CacheServices;
  let consoleError: MockInstance<typeof console.error>;
  let job: CacheVerifyJob;

  beforeAll(async () => {
    // The job works across the whole database, so it gets one of its own
    ({ databaseClient, dispose: disposeDatabase } = await createIsolatedDatabaseClient());
    userId = (await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id;
  });

  afterAll(async () => {
    await disposeDatabase();
  });

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    cacheRoot = Path.join(tmpDir, 'cache');
    ({ services } = createCacheTestServices(databaseClient, cacheRoot));
    await services.cacheFileStorage.createRootMarker();
    job = new CacheVerifyJob(services.cacheFileStorage, databaseClient);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await databaseClient.cacheAppEntry.deleteMany();
    await databaseClient.cacheUserEntry.deleteMany();
  });

  function createWrite(overrides: Partial<CacheIndexWrite>): CacheIndexWrite {
    return {
      namespace: 'anidb.anime-xml',
      version: 1,
      key: '17',
      groupKey: null,
      validator: null,
      payload: null,
      writtenAt: new Date(),
      freshUntil: null,
      keepUntil: null,
      ...overrides,
    };
  }

  async function storeFile(entryUserId: string | null, modifiedAt: Date, fileId = Crypto.randomUUID()): Promise<CacheFileLocation> {
    const { tempPath } = await services.cacheFileStorage.allocateTemp();
    await services.cacheFileStorage.writeTemp(tempPath, Buffer.from('<anime id="17"><title>Cowboy Bebop</title></anime>'));
    await Fs.promises.utimes(tempPath, modifiedAt, modifiedAt);
    const location = { userId: entryUserId, namespace: 'anidb.anime-xml', version: 1, fileId };
    await services.cacheFileStorage.moveIntoPlace(tempPath, location);
    return location;
  }

  async function storeRow(location: CacheFileLocation, key = '17'): Promise<void> {
    const index = location.userId == null ? services.appCacheIndex : services.userCacheIndex.forUser(location.userId);
    await index.upsertReturningPrevious(createWrite({
      key, version: location.version, payload: { fileId: location.fileId, sizeBytes: 51, contentType: 'application/xml' },
    }));
  }

  async function createTempFile(name: string, modifiedAt: Date): Promise<void> {
    const tempPath = Path.join(services.cacheFileStorage.getTempDirectory(), name);
    await Fs.promises.mkdir(Path.dirname(tempPath), { recursive: true });
    await Fs.promises.writeFile(tempPath, 'half a thumbnail');
    await Fs.promises.utimes(tempPath, modifiedAt, modifiedAt);
  }

  describe('files without an entry', () => {
    test('Deletes an app file older than an hour that no entry points to', async () => {
      const location = await storeFile(null, TWO_HOURS_AGO);

      await job.run();

      await expect(cacheFileExists(services, location)).resolves.toBe(false);
    });

    test('Deletes a user file older than an hour that no entry points to', async () => {
      const location = await storeFile(userId, TWO_HOURS_AGO);

      await job.run();

      await expect(cacheFileExists(services, location)).resolves.toBe(false);
    });

    test('Keeps a younger file, whose entry may be about to be committed', async () => {
      const location = await storeFile(null, new Date());

      await job.run();

      await expect(cacheFileExists(services, location)).resolves.toBe(true);
    });

    test('Keeps an old file that an entry points to', async () => {
      const location = await storeFile(userId, TWO_HOURS_AGO);
      await storeRow(location);

      await job.run();

      await expect(cacheFileExists(services, location)).resolves.toBe(true);
    });

    test('Deletes an old file of an outdated version, whose entry the expire job deleted already', async () => {
      const location = await storeFile(null, TWO_HOURS_AGO);
      await storeRow({ ...location, version: 2 });

      await job.run();

      await expect(cacheFileExists(services, location)).resolves.toBe(false);
    });

    test('Removes a namespace directory once its last file is deleted', async () => {
      await storeFile(null, TWO_HOURS_AGO);

      await job.run();

      await expect(Fs.promises.readdir(services.cacheFileStorage.getScopeDirectory(null))).resolves.toEqual([]);
    });
  });

  describe('entries without a file', () => {
    test('Deletes an app entry whose file is missing', async () => {
      await storeRow({ userId: null, namespace: 'anidb.anime-xml', version: 1, fileId: Crypto.randomUUID() });

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual([]);
    });

    test('Deletes a user entry whose file is missing, keeping its sibling whose file exists', async () => {
      await storeRow({ userId, namespace: 'anidb.anime-xml', version: 1, fileId: Crypto.randomUUID() }, '17');
      await storeRow(await storeFile(userId, TWO_HOURS_AGO), '18');

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['18']);
    });

    test('Deletes an entry whose file lies in the wrong shard directory', async () => {
      const fileId = 'd052861a-12ea-4df8-aad7-2f53ae4aef70';
      const location = { userId: null, namespace: 'anidb.anime-xml', version: 1, fileId };
      await storeRow(location);
      const misplacedPath = Path.join(services.cacheFileStorage.getNamespaceDirectory(null, 'anidb.anime-xml', 1), 'ff', fileId);
      await Fs.promises.mkdir(Path.dirname(misplacedPath), { recursive: true });
      await Fs.promises.writeFile(misplacedPath, '<anime id="17"/>');

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual([]);
    });

    test('Keeps a cached null, which never has a file', async () => {
      await services.appCacheIndex.upsertReturningPrevious(createWrite({ key: '999999', payload: null }));

      await job.run();

      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['999999']);
    });
  });

  describe('temp files', () => {
    test('Deletes a temp file older than an hour', async () => {
      await createTempFile('3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47', TWO_HOURS_AGO);

      await job.run();

      await expect(Fs.promises.readdir(services.cacheFileStorage.getTempDirectory())).resolves.toEqual([]);
    });

    test('Keeps a younger temp file, which a write may still be filling', async () => {
      await createTempFile('3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47', new Date());

      await job.run();

      await expect(Fs.promises.readdir(services.cacheFileStorage.getTempDirectory())).resolves.toEqual(['3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47']);
    });
  });

  test('Removes the directory of a user who no longer exists', async () => {
    const deletedUserLocation = await storeFile('cmgdeleteduser0000000000', new Date());

    await job.run();

    await expect(cacheFileExists(services, deletedUserLocation)).resolves.toBe(false);
    await expect(Fs.promises.readdir(services.cacheFileStorage.getUsersDirectory())).resolves.toEqual([]);
  });

  test('Leaves content outside its own directories alone', async () => {
    await Fs.promises.writeFile(Path.join(cacheRoot, 'README.txt'), 'Notes of the administrator');
    await Fs.promises.utimes(Path.join(cacheRoot, 'README.txt'), TWO_HOURS_AGO, TWO_HOURS_AGO);

    await job.run();

    await expect(Fs.promises.readdir(cacheRoot)).resolves.toContain('README.txt');
  });

  describe('when the cache directory lacks its marker file', () => {
    beforeEach(async () => {
      await Fs.promises.rm(Path.join(cacheRoot, CacheFileStorage.CACHE_ROOT_MARKER_FILE_NAME));
    });

    test('Deletes neither files nor entries', async () => {
      const orphanLocation = await storeFile(null, TWO_HOURS_AGO);
      await storeRow({ userId: null, namespace: 'anidb.anime-xml', version: 1, fileId: Crypto.randomUUID() }, '18');

      await job.run();

      await expect(cacheFileExists(services, orphanLocation)).resolves.toBe(true);
      await expect(findAllCacheKeys(databaseClient)).resolves.toEqual(['18']);
    });

    test('Logs an error naming the directory', async () => {
      await job.run();

      expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`'${cacheRoot}' lacks the file '.apollo-cache-root'`));
    });
  });

  test('Joins a run that is already in progress', async () => {
    const firstRun = job.run();

    const secondRun = job.run();

    expect(secondRun).toBe(firstRun);
    await firstRun;
  });
});
