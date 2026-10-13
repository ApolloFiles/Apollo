import { CacheCodecs } from '#src/cache/CacheCodec.js';
import type { CacheFactory } from '#src/cache/CacheFactory.js';
import { CacheEngine, type CacheScope } from '#src/cache/internal/CacheEngine.js';
import { CacheFileStorage } from '#src/cache/internal/CacheFileStorage.js';
import type { CacheServices } from '#src/cache/internal/CacheServices.js';
import { AppCacheIndex } from '#src/cache/internal/database/AppCacheIndex.js';
import type { CacheIndexRow } from '#src/cache/internal/database/CacheIndexRow.js';
import type { CacheMissCounter } from '#src/cache/internal/CacheMissCounter.js';
import { FileCacheEntry } from '#src/cache/internal/entry/FileCacheEntry.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import { createCacheTestServices } from '#tests/acceptance/cache/CacheTestServices.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import { TimeUnit } from '@spraxdev/node-commons/util';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';
import type { Mock, MockInstance } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { z } from 'zod';

const ANIME_XML = '<anime id="17"><title>Cowboy Bebop</title></anime>';

class AniDbUnavailableError extends Error {
  override name = this.constructor.name;
}

describe(CacheEngine, () => {
  let databaseClient: DatabaseClient;
  let tmpDir: string;
  let cacheRoot: string;
  let namespace: string;
  let appCacheIndex: AppCacheIndex;
  let cacheMissCounter: DeepMockProxy<CacheMissCounter>;
  let services: CacheServices;
  let scope: CacheScope;
  let engine: CacheEngine<string | null>;
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
    // Test files share the database, so every test works in a namespace of its own
    namespace = `anidb.anime-xml.${Crypto.randomUUID()}`;

    ({ services, cacheMissCounter } = createCacheTestServices(databaseClient, cacheRoot));
    appCacheIndex = services.appCacheIndex;

    scope = { index: appCacheIndex, userId: null };
    engine = new CacheEngine<string | null>(services, { namespace, version: 1, codec: CacheCodecs.text(), expiry: 'never' });
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await databaseClient.cacheAppEntry.deleteMany({ where: { namespace } });
  });

  async function findRow(key = '17'): Promise<CacheIndexRow> {
    const row = await appCacheIndex.find(namespace, 1, key);
    expect(row).not.toBeNull();
    return row!;
  }

  async function filePathOf(key = '17'): Promise<string> {
    const { fileId } = await findRow(key);
    return Path.join(cacheRoot, 'app', `${namespace}@1`, fileId!.slice(0, 2), fileId!);
  }

  async function listStoredFiles(scopeDirectory = 'app'): Promise<string[]> {
    const entries = await Fs.promises.readdir(Path.join(cacheRoot, scopeDirectory), { recursive: true, withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  }

  async function setRowDates(dates: { freshUntil?: Date, keepUntil?: Date, lastAccessedAt?: Date }): Promise<void> {
    await databaseClient.cacheAppEntry.updateMany({ where: { namespace }, data: dates });
  }

  describe('reading', () => {
    test('Misses when nothing is stored under the key', async () => {
      await expect(engine.get(scope, '17')).resolves.toBeUndefined();
    });

    test('Returns a stored value', async () => {
      await engine.set(scope, '17', ANIME_XML);

      await using entry = await engine.get(scope, '17');

      expect(entry).toMatchObject({ isNull: false, isStale: false });
      await expect(entry!.value()).resolves.toBe(ANIME_XML);
    });

    test('Returns a cached null as a null entry', async () => {
      await engine.set(scope, '17', null);

      await using entry = await engine.get(scope, '17');

      expect(entry).toMatchObject({ isNull: true, isStale: false, etag: null });
    });

    test('Marks an entry past its fresh date as stale', async () => {
      await engine.set(scope, '17', ANIME_XML);
      await setRowDates({ freshUntil: new Date('2026-01-01T00:00:00Z'), keepUntil: new Date('2099-01-01T00:00:00Z') });

      await using entry = await engine.get(scope, '17');

      expect(entry).toMatchObject({ isStale: true });
    });

    test('Misses an entry past its keep date and leaves the row to the expire job', async () => {
      await engine.set(scope, '17', ANIME_XML);
      await setRowDates({ freshUntil: new Date('2026-01-01T00:00:00Z'), keepUntil: new Date('2026-02-01T00:00:00Z') });

      const entry = await engine.get(scope, '17');

      expect(entry).toBeUndefined();
      await expect(appCacheIndex.find(namespace, 1, '17')).resolves.not.toBeNull();
    });

    test('Misses an entry whose validator differs and deletes it', async () => {
      await engine.set(scope, '17', ANIME_XML, { validator: '8123456789;1759305600000' });

      const entry = await engine.get(scope, '17', '8123456789;1760000000000');

      expect(entry).toBeUndefined();
      await expect(appCacheIndex.find(namespace, 1, '17')).resolves.toBeNull();
    });

    test('Updates the last access of an entry not read for over a day', async () => {
      await engine.set(scope, '17', ANIME_XML);
      await setRowDates({ lastAccessedAt: new Date('2026-01-01T00:00:00Z') });

      await using _entry = await engine.get(scope, '17');

      await vi.waitFor(async () => {
        expect((await findRow()).lastAccessedAt.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00Z').getTime());
      });
    });

    test('Misses and deletes a JSON entry that no longer matches its schema', async () => {
      const jsonEngine = new CacheEngine(services, { namespace, version: 1, codec: CacheCodecs.json(z.object({ title: z.string() })), expiry: 'never' });
      await jsonEngine.set(scope, '17', { title: 'Cowboy Bebop' });
      await Fs.promises.writeFile(await filePathOf(), '{"titel":"Cowboy Bebop"}');

      const entry = await jsonEngine.get(scope, '17');

      expect(entry).toBeUndefined();
      await expect(appCacheIndex.find(namespace, 1, '17')).resolves.toBeNull();
    });

    test('Decodes a JSON entry only once per read', async () => {
      const codec = CacheCodecs.json(z.object({ title: z.string() }));
      const jsonEngine = new CacheEngine(services, { namespace, version: 1, codec, expiry: 'never' });
      await jsonEngine.set(scope, '17', { title: 'Cowboy Bebop' });
      const decode = vi.spyOn(codec, 'decode');

      await using entry = await jsonEngine.get(scope, '17');
      await entry!.value();

      expect(decode).toHaveBeenCalledOnce();
    });

    test('Misses and warns when the lookup fails', async () => {
      vi.spyOn(appCacheIndex, 'find').mockRejectedValue(new Error('Connection terminated unexpectedly'));

      await expect(engine.get(scope, '17')).resolves.toBeUndefined();
      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('treating it as a miss'), expect.any(Error));
    });

    describe('when the file is broken', () => {
      beforeEach(async () => {
        await services.cacheFileStorage.createRootMarker();
      });

      test('Misses and deletes the entry when its file is missing', async () => {
        await engine.set(scope, '17', ANIME_XML);
        await Fs.promises.rm(await filePathOf());

        const entry = await engine.get(scope, '17');

        expect(entry).toBeUndefined();
        await expect(appCacheIndex.find(namespace, 1, '17')).resolves.toBeNull();
      });

      test('Counts a missing file towards the on-demand verify', async () => {
        await engine.set(scope, '17', ANIME_XML);
        await Fs.promises.rm(await filePathOf());

        await engine.get(scope, '17');

        expect(cacheMissCounter.record).toHaveBeenCalledOnce();
      });

      test('Misses, deletes and counts an entry whose file is truncated', async () => {
        await engine.set(scope, '17', ANIME_XML);
        await Fs.promises.truncate(await filePathOf(), 10);

        const entry = await engine.get(scope, '17');

        expect(entry).toBeUndefined();
        expect(cacheMissCounter.record).toHaveBeenCalledOnce();
        await expect(appCacheIndex.find(namespace, 1, '17')).resolves.toBeNull();
      });

      test('Reads the new file when an overwrite deleted the old one after its row was read', async () => {
        await engine.set(scope, '17', ANIME_XML);
        const overwrittenRow = await findRow();
        await engine.set(scope, '17', '<anime id="17"><title>Cowboy Bebop: The Movie</title></anime>');
        vi.spyOn(appCacheIndex, 'find').mockResolvedValueOnce(overwrittenRow);

        await using entry = await engine.get(scope, '17');

        await expect(entry!.value()).resolves.toBe('<anime id="17"><title>Cowboy Bebop: The Movie</title></anime>');
        expect(cacheMissCounter.record).not.toHaveBeenCalled();
      });

      describe('and the cache directory lacks its marker file', () => {
        let consoleError: MockInstance<typeof console.error>;

        beforeEach(async () => {
          consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
          await engine.set(scope, '17', ANIME_XML);
          await Fs.promises.rm(await filePathOf());
          await Fs.promises.rm(Path.join(cacheRoot, CacheFileStorage.CACHE_ROOT_MARKER_FILE_NAME));
        });

        test('Misses but keeps the entry, as the directory may only be unmounted', async () => {
          const entry = await engine.get(scope, '17');

          expect(entry).toBeUndefined();
          await expect(appCacheIndex.find(namespace, 1, '17')).resolves.not.toBeNull();
        });

        test('Logs an error', async () => {
          await engine.get(scope, '17');

          expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('lacks its marker file'));
        });

        test('Still counts the miss towards the on-demand verify', async () => {
          await engine.get(scope, '17');

          expect(cacheMissCounter.record).toHaveBeenCalledOnce();
        });
      });
    });
  });

  describe('getting or creating', () => {
    test('Stores what the factory returns', async () => {
      await using _created = await engine.getOrCreate(scope, '17', async () => ANIME_XML);

      await using entry = await engine.get(scope, '17');

      await expect(entry!.value()).resolves.toBe(ANIME_XML);
    });

    test('Returns what the factory returns', async () => {
      await using entry = await engine.getOrCreate(scope, '17', async () => ANIME_XML);

      await expect(entry.value()).resolves.toBe(ANIME_XML);
    });

    test('Does not call the factory for a fresh entry', async () => {
      await engine.set(scope, '17', ANIME_XML);
      const factory: Mock<CacheFactory<string>> = vi.fn();

      await using _entry = await engine.getOrCreate(scope, '17', factory);

      expect(factory).not.toHaveBeenCalled();
    });

    test('Calls the factory once for concurrent requests', async () => {
      const factory: Mock<CacheFactory<string>> = vi.fn(async () => ANIME_XML);

      const entries = await Promise.all([1, 2, 3].map(() => engine.getOrCreate(scope, '17', factory)));
      await Promise.all(entries.map((entry) => entry[Symbol.asyncDispose]()));

      expect(factory).toHaveBeenCalledOnce();
    });

    test('Gives each concurrent caller an entry it can read on its own', async () => {
      const entries = await Promise.all([1, 2, 3].map(() => engine.getOrCreate(scope, '17', async () => ANIME_XML)));

      const values = await Promise.all(entries.map((entry) => entry.value()));

      expect(values).toEqual([ANIME_XML, ANIME_XML, ANIME_XML]);
    });

    test('Does not make a caller that saw another version of the source file wait for its computation', async () => {
      let releaseOldVersion!: () => void;
      const oldVersionReleased = new Promise<void>((resolve) => releaseOldVersion = resolve);
      const oldVersionRequest = engine.getOrCreate(scope, '17', async () => {
        await oldVersionReleased;
        return '<anime id="17"><title>Cowboy Bebop (old)</title></anime>';
      }, { validator: '8123456789;1759305600000' });

      await using newEntry = await engine.getOrCreate(scope, '17', async () => ANIME_XML, { validator: '8123456789;1760000000000' });

      await expect(newEntry.value()).resolves.toBe(ANIME_XML);
      releaseOldVersion();
      await (await oldVersionRequest)[Symbol.asyncDispose]();
    });

    test('Rejects an expiry that would expire the entry right away, without calling the factory', async () => {
      const factory: Mock<CacheFactory<string>> = vi.fn(async () => ANIME_XML);

      await expect(engine.getOrCreate(scope, '17', factory, { expiry: { freshMs: 0 } })).rejects.toThrow('Invalid cache expiry {"freshMs":0}');
      expect(factory).not.toHaveBeenCalled();
    });

    test('Stores the file a factory wrote to the temp path', async () => {
      const bytesEngine = new CacheEngine(services, { namespace, version: 1, codec: CacheCodecs.bytes(), expiry: 'never' });

      await using entry = await bytesEngine.getOrCreate(scope, '17', async (context) => {
        await Fs.promises.writeFile(context.tempPath, 'avif bytes from ffmpeg');
        return context.fromTempFile();
      }, { contentType: 'image/avif' });

      expect(entry).toMatchObject({ isNull: false, contentType: 'image/avif', sizeBytes: 22 });
      await expect(entry.value()).resolves.toEqual(Buffer.from('avif bytes from ffmpeg'));
    });

    test('Caches a null the factory returns', async () => {
      await using _first = await engine.getOrCreate(scope, '17', async () => null);
      const factory: Mock<CacheFactory<string>> = vi.fn();

      await using entry = await engine.getOrCreate(scope, '17', factory);

      expect(entry).toMatchObject({ isNull: true });
      expect(factory).not.toHaveBeenCalled();
    });

    test('Rejects with the factory\'s error and stores nothing', async () => {
      await expect(engine.getOrCreate(scope, '17', async () => {
        throw new Error('AniDB answered with 503');
      })).rejects.toThrow('AniDB answered with 503');

      await expect(appCacheIndex.find(namespace, 1, '17')).resolves.toBeNull();
    });

    test('Leaves no temp file behind when the factory fails', async () => {
      await engine.getOrCreate(scope, '17', async (context) => {
        await Fs.promises.writeFile(context.tempPath, 'half a thumbnail');
        throw new Error('ffmpeg exited with code 1');
      }).catch(() => undefined);

      await expect(Fs.promises.readdir(Path.join(cacheRoot, '.tmp'))).resolves.toEqual([]);
    });

    test('Calls the factory when checking for an entry stored in the meantime fails', async () => {
      // The first lookup finds nothing; the check right before the factory runs fails
      vi.spyOn(appCacheIndex, 'find')
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

      await using entry = await engine.getOrCreate(scope, '17', async () => ANIME_XML);

      await expect(entry.value()).resolves.toBe(ANIME_XML);
      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('running its factory anyway'), expect.any(Error));
    });

    describe('when the stored entry is stale', () => {
      beforeEach(async () => {
        await engine.set(scope, '17', ANIME_XML, { expiry: { freshMs: TimeUnit.DAYS.toMillis(1), staleMs: TimeUnit.DAYS.toMillis(30) } });
        await setRowDates({ freshUntil: new Date('2026-01-01T00:00:00Z'), keepUntil: new Date('2099-01-01T00:00:00Z') });
      });

      test('Replaces it with the factory\'s new value', async () => {
        await using entry = await engine.getOrCreate(scope, '17', async () => '<anime id="17"><title>Cowboy Bebop (2026)</title></anime>');

        expect(entry.isStale).toBe(false);
        await expect(entry.value()).resolves.toBe('<anime id="17"><title>Cowboy Bebop (2026)</title></anime>');
      });

      test('Serves it when refreshing fails and stale entries may be served on error', async () => {
        await using entry = await engine.getOrCreate(scope, '17', async () => {
          throw new Error('AniDB answered with 503');
        }, { serveStaleOnError: true });

        expect(entry.isStale).toBe(true);
        await expect(entry.value()).resolves.toBe(ANIME_XML);
      });

      test('Warns when serving it because refreshing failed', async () => {
        await using _entry = await engine.getOrCreate(scope, '17', async () => {
          throw new Error('AniDB answered with 503');
        }, { serveStaleOnError: true });

        expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('serving the stale entry'), expect.any(Error));
      });

      test('Returns the new entry even when closing the stale one fails', async () => {
        vi.spyOn(FileCacheEntry.prototype, Symbol.asyncDispose).mockRejectedValueOnce(new Error('EIO: i/o error, close'));

        await using entry = await engine.getOrCreate(scope, '17', async () => '<anime id="17"><title>Cowboy Bebop (2026)</title></anime>', { serveStaleOnError: true });

        await expect(entry.value()).resolves.toBe('<anime id="17"><title>Cowboy Bebop (2026)</title></anime>');
      });

      test('Rejects when refreshing fails and stale entries may not be served', async () => {
        await expect(engine.getOrCreate(scope, '17', async () => {
          throw new Error('AniDB answered with 503');
        })).rejects.toThrow('AniDB answered with 503');
      });

      describe('when only some errors may serve it', () => {
        const serveStaleOnError = (err: unknown): boolean => err instanceof AniDbUnavailableError;

        test('Serves it when refreshing fails with an accepted error', async () => {
          await using entry = await engine.getOrCreate(scope, '17', async () => {
            throw new AniDbUnavailableError('AniDB answered with 503');
          }, { serveStaleOnError });

          expect(entry.isStale).toBe(true);
          await expect(entry.value()).resolves.toBe(ANIME_XML);
        });

        test('Rejects with any other error', async () => {
          await expect(engine.getOrCreate(scope, '17', async () => {
            throw new TypeError('Cannot read properties of undefined (reading \'title\')');
          }, { serveStaleOnError })).rejects.toThrow(new TypeError('Cannot read properties of undefined (reading \'title\')'));
        });

        test('Closes it before rejecting with any other error', async () => {
          const dispose = vi.spyOn(FileCacheEntry.prototype, Symbol.asyncDispose);

          await expect(engine.getOrCreate(scope, '17', async () => {
            throw new TypeError('Cannot read properties of undefined (reading \'title\')');
          }, { serveStaleOnError })).rejects.toThrow(TypeError);

          expect(dispose).toHaveBeenCalledOnce();
        });
      });
    });

    describe('when storing fails', () => {
      beforeEach(() => {
        vi.spyOn(appCacheIndex, 'upsertReturningPrevious').mockRejectedValue(new Error('Connection terminated unexpectedly'));
      });

      test('Returns the factory\'s value uncached', async () => {
        await using entry = await engine.getOrCreate(scope, '17', async () => ANIME_XML);

        expect(entry.etag).toBeNull();
        await expect(entry.value()).resolves.toBe(ANIME_XML);
      });

      test('Returns a file the factory wrote uncached', async () => {
        const bytesEngine = new CacheEngine(services, { namespace, version: 1, codec: CacheCodecs.bytes(), expiry: 'never' });

        await using entry = await bytesEngine.getOrCreate(scope, '17', async (context) => {
          await Fs.promises.writeFile(context.tempPath, 'avif bytes from ffmpeg');
          return context.fromTempFile();
        });

        await expect(entry.value()).resolves.toEqual(Buffer.from('avif bytes from ffmpeg'));
      });

      test('Returns a null the factory returns uncached', async () => {
        await using entry = await engine.getOrCreate(scope, '17', async () => null);

        expect(entry).toMatchObject({ isNull: true });
        expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Could not store'), expect.any(Error));
      });

      test('Deletes the file it moved into place for the entry', async () => {
        await using _entry = await engine.getOrCreate(scope, '17', async () => ANIME_XML);

        await expect(listStoredFiles()).resolves.toEqual([]);
      });

      test('Keeps the file when the entry was stored after all', async () => {
        vi.mocked(appCacheIndex.upsertReturningPrevious).mockImplementation(async (write) => {
          await AppCacheIndex.prototype.upsertReturningPrevious.call(appCacheIndex, write);
          throw new Error('Connection terminated unexpectedly');
        });
        await using _created = await engine.getOrCreate(scope, '17', async () => ANIME_XML);

        await using entry = await engine.get(scope, '17');

        await expect(entry!.value()).resolves.toBe(ANIME_XML);
      });

      test('Warns that the value could not be stored', async () => {
        await using _entry = await engine.getOrCreate(scope, '17', async () => ANIME_XML);

        expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Could not store'), expect.any(Error));
      });
    });
  });

  describe('writing', () => {
    test('Deletes the replaced file when overwriting an entry', async () => {
      await engine.set(scope, '17', ANIME_XML);

      await engine.set(scope, '17', '<anime id="17"><title>Cowboy Bebop: The Movie</title></anime>');

      await expect(listStoredFiles()).resolves.toEqual([(await findRow()).fileId]);
    });

    test('Leaves no temp file behind', async () => {
      await engine.set(scope, '17', ANIME_XML);

      await expect(Fs.promises.readdir(Path.join(cacheRoot, '.tmp'))).resolves.toEqual([]);
    });

    test('Rejects an expiry that would expire the entry right away', async () => {
      await expect(engine.set(scope, '17', null, { nullExpiry: { freshMs: -1000 } })).rejects.toThrow('Invalid cache expiry {"freshMs":-1000}');
    });

    test('Gives a cached null its own expiry', async () => {
      const engineWithNullExpiry = new CacheEngine<string | null>(services, {
        namespace, version: 1, codec: CacheCodecs.text(),
        expiry: { freshMs: TimeUnit.DAYS.toMillis(1) },
        nullExpiry: { freshMs: TimeUnit.HOURS.toMillis(6) },
      });

      await engineWithNullExpiry.set(scope, '17', null);

      const row = await findRow();
      expect(row.keepUntil!.getTime() - row.createdAt.getTime()).toBe(6 * 60 * 60 * 1000);
    });

    test('Resolves and warns when storing fails', async () => {
      vi.spyOn(appCacheIndex, 'upsertReturningPrevious').mockRejectedValue(new Error('Connection terminated unexpectedly'));

      await engine.set(scope, '17', ANIME_XML);

      expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Could not store'), expect.any(Error));
    });

    test('Keeps the stored file when it cannot tell whether the entry was stored', async () => {
      vi.spyOn(appCacheIndex, 'upsertReturningPrevious').mockRejectedValue(new Error('Connection terminated unexpectedly'));
      vi.spyOn(appCacheIndex, 'find').mockRejectedValue(new Error('Connection terminated unexpectedly'));

      await engine.set(scope, '17', ANIME_XML);

      await expect(listStoredFiles()).resolves.toHaveLength(1);
      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('leaving its file to the verify job'), expect.any(Error));
    });

    test('Stores a user\'s entry below that user\'s directory', async ({ onTestFinished }) => {
      const userId = (await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id;
      onTestFinished(async () => {
        await databaseClient.authUser.delete({ where: { id: userId } });
      });
      const userScope: CacheScope = { index: services.userCacheIndex.forUser(userId), userId };

      await engine.set(userScope, '17', ANIME_XML);

      await expect(listStoredFiles(Path.join('user', userId))).resolves.toHaveLength(1);
    });
  });

  test('Deleting an entry removes its row and its file', async () => {
    await engine.set(scope, '17', ANIME_XML);

    await engine.delete(scope, '17');

    await expect(appCacheIndex.find(namespace, 1, '17')).resolves.toBeNull();
    await expect(listStoredFiles()).resolves.toEqual([]);
  });

  test('Deleting resolves and warns when the lookup fails', async () => {
    vi.spyOn(appCacheIndex, 'find').mockRejectedValue(new Error('Connection terminated unexpectedly'));

    await expect(engine.delete(scope, '17')).resolves.toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Could not delete'), expect.any(Error));
  });
});
