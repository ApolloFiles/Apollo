import { CacheEntryDeleter } from '#src/cache/internal/CacheEntryDeleter.js';
import type { CacheFileStorage } from '#src/cache/internal/CacheFileStorage.js';
import type { CacheIndexRow, DeletedCacheRow } from '#src/cache/internal/database/CacheIndexRow.js';
import type { ScopedCacheIndex } from '#src/cache/internal/database/ScopedCacheIndex.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import type { MockInstance } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';

const ROW: CacheIndexRow = {
  id: 7380451239847002112n,
  userId: 'kD8fQ2mXv7LpR4tN9wZ',
  namespace: 'media.thumbnail',
  version: 2,
  key: 'default:/movies/Arrival.mkv|avif',
  fileId: 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85',
  isNull: false,
  groupKey: 'default:/movies/Arrival.mkv',
  sizeBytes: 18_442,
  contentType: 'image/avif',
  validator: '8123456789;1759305600000',
  createdAt: new Date('2026-10-01T08:00:00Z'),
  freshUntil: null,
  keepUntil: null,
  lastAccessedAt: new Date('2026-10-01T08:00:00Z'),
};

describe(CacheEntryDeleter, () => {
  let cacheFileStorage: DeepMockProxy<CacheFileStorage>;
  let index: DeepMockProxy<ScopedCacheIndex>;
  let deleter: CacheEntryDeleter;

  beforeEach(() => {
    cacheFileStorage = createStrictDeepMock<CacheFileStorage>();
    cacheFileStorage.deleteFile.mockResolvedValue();
    index = createStrictDeepMock<ScopedCacheIndex>();
    deleter = new CacheEntryDeleter(cacheFileStorage);
  });

  describe('deleting a single entry', () => {
    test('Deletes the row only if it still points to the same file', async () => {
      index.deleteExact.mockResolvedValue(true);

      await deleter.deleteEntry(index, ROW);

      expect(index.deleteExact).toHaveBeenCalledExactlyOnceWith(ROW);
    });

    test('Deletes the file after the row', async () => {
      index.deleteExact.mockResolvedValue(true);

      await deleter.deleteEntry(index, ROW);

      expect(cacheFileStorage.deleteFile).toHaveBeenCalledExactlyOnceWith({
        userId: 'kD8fQ2mXv7LpR4tN9wZ',
        namespace: 'media.thumbnail',
        version: 2,
        fileId: 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85',
      });
      expect(index.deleteExact.mock.invocationCallOrder[0]).toBeLessThan(cacheFileStorage.deleteFile.mock.invocationCallOrder[0]);
    });

    test('Keeps the file when the row was overwritten in the meantime', async () => {
      index.deleteExact.mockResolvedValue(false);

      await deleter.deleteEntry(index, ROW);

      expect(cacheFileStorage.deleteFile).not.toHaveBeenCalled();
    });

    test('Deletes no file for a cached null', async () => {
      index.deleteExact.mockResolvedValue(true);

      await deleter.deleteEntry(index, { ...ROW, isNull: true, fileId: null, sizeBytes: 0, contentType: null });

      expect(cacheFileStorage.deleteFile).not.toHaveBeenCalled();
    });

    test('Rejects with the error when the row cannot be deleted', async () => {
      index.deleteExact.mockRejectedValue(new Error('Connection terminated unexpectedly'));

      await expect(deleter.deleteEntry(index, ROW)).rejects.toThrow('Connection terminated unexpectedly');
    });

    test('Keeps the file when the row cannot be deleted', async () => {
      index.deleteExact.mockRejectedValue(new Error('Connection terminated unexpectedly'));

      await deleter.deleteEntry(index, ROW).catch(() => undefined);

      expect(cacheFileStorage.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('deleting the files of already deleted rows', () => {
    const DELETED_ROWS: DeletedCacheRow[] = [
      { userId: 'kD8fQ2mXv7LpR4tN9wZ', namespace: 'media.thumbnail', version: 2, fileId: 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85' },
      { userId: 'kD8fQ2mXv7LpR4tN9wZ', namespace: 'media.thumbnail', version: 2, fileId: null },
      { userId: null, namespace: 'anidb.anime-xml', version: 1, fileId: '3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47' },
    ];

    test('Deletes the file of every row that has one', async () => {
      await deleter.deleteFilesOf(DELETED_ROWS);

      expect(cacheFileStorage.deleteFile.mock.calls).toEqual([
        [{ userId: 'kD8fQ2mXv7LpR4tN9wZ', namespace: 'media.thumbnail', version: 2, fileId: 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85' }],
        [{ userId: null, namespace: 'anidb.anime-xml', version: 1, fileId: '3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47' }],
      ]);
    });

    describe('when a file cannot be deleted', () => {
      let consoleWarn: MockInstance<typeof console.warn>;

      beforeEach(() => {
        consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        cacheFileStorage.deleteFile.mockImplementation(async (location) => {
          if (location.fileId === 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85') {
            throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
          }
        });
      });

      test('Still deletes the remaining files', async () => {
        await deleter.deleteFilesOf(DELETED_ROWS);

        expect(cacheFileStorage.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ fileId: '3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47' }));
      });

      test('Resolves, leaving the orphan to the verify job', async () => {
        await expect(deleter.deleteFilesOf(DELETED_ROWS)).resolves.toBeUndefined();
      });

      test('Warns with the namespace, version and file id', async () => {
        await deleter.deleteFilesOf(DELETED_ROWS);

        expect(consoleWarn).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining('media.thumbnail@2/c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85'),
          expect.objectContaining({ code: 'EACCES' }),
        );
      });
    });
  });
});
