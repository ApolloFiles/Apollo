import { AppCacheIndex } from '#src/cache/internal/database/AppCacheIndex.js';
import type { CacheIndexRow } from '#src/cache/internal/database/CacheIndexRow.js';
import type { CacheIndexWrite } from '#src/cache/internal/database/CacheIndexWrite.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import Crypto from 'node:crypto';

const FIRST_FILE_ID = '3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47';
const SECOND_FILE_ID = 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85';

describe(AppCacheIndex, () => {
  let databaseClient: DatabaseClient;
  let namespace: string;
  let index: AppCacheIndex;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(() => {
    // Test files share the database, so every test works in a namespace of its own
    namespace = `anidb.anime-xml.${Crypto.randomUUID()}`;
    index = new AppCacheIndex(databaseClient);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await databaseClient.cacheAppEntry.deleteMany({ where: { namespace } });
  });

  function createWrite(overrides: Partial<CacheIndexWrite> = {}): CacheIndexWrite {
    return {
      namespace,
      version: 1,
      key: '17',
      groupKey: null,
      validator: null,
      payload: { fileId: FIRST_FILE_ID, sizeBytes: 48_213, contentType: 'application/xml' },
      writtenAt: new Date('2026-10-01T08:00:00Z'),
      freshUntil: new Date('2026-10-02T08:00:00Z'),
      keepUntil: new Date('2026-10-31T08:00:00Z'),
      ...overrides,
    };
  }

  async function findRequired(key = '17', version = 1): Promise<CacheIndexRow> {
    const row = await index.find(namespace, version, key);
    expect(row).not.toBeNull();
    return row!;
  }

  describe('finding an entry', () => {
    test('Returns null when there is no entry for the key', async () => {
      await expect(index.find(namespace, 1, '17')).resolves.toBeNull();
    });

    test('Returns null for an entry written under a different version', async () => {
      await index.upsertReturningPrevious(createWrite({ version: 1 }));

      await expect(index.find(namespace, 2, '17')).resolves.toBeNull();
    });

    test('Returns everything that was written, without a user', async () => {
      await index.upsertReturningPrevious(createWrite({ groupKey: 'anime:17', validator: '48213;1759305600000' }));

      await expect(index.find(namespace, 1, '17')).resolves.toEqual({
        id: expect.any(BigInt),
        userId: null,
        namespace,
        version: 1,
        key: '17',
        fileId: FIRST_FILE_ID,
        isNull: false,
        groupKey: 'anime:17',
        sizeBytes: 48_213,
        contentType: 'application/xml',
        validator: '48213;1759305600000',
        createdAt: new Date('2026-10-01T08:00:00Z'),
        freshUntil: new Date('2026-10-02T08:00:00Z'),
        keepUntil: new Date('2026-10-31T08:00:00Z'),
        lastAccessedAt: new Date('2026-10-01T08:00:00Z'),
      });
    });

    test('Returns the size as a number', async () => {
      await index.upsertReturningPrevious(createWrite());

      const row = await findRequired();

      expect(row.sizeBytes).toBe(48_213);
    });

    test('Returns null expiry dates for an entry that never expires', async () => {
      await index.upsertReturningPrevious(createWrite({ freshUntil: null, keepUntil: null }));

      const row = await findRequired();

      expect(row.freshUntil).toBeNull();
      expect(row.keepUntil).toBeNull();
    });
  });

  describe('writing an entry', () => {
    test('Reports no previous file for a new entry', async () => {
      await expect(index.upsertReturningPrevious(createWrite())).resolves.toEqual({ previousFileId: null });
    });

    test('Reports the replaced file when overwriting an entry', async () => {
      await index.upsertReturningPrevious(createWrite({ payload: { fileId: FIRST_FILE_ID, sizeBytes: 48_213, contentType: 'application/xml' } }));

      const result = await index.upsertReturningPrevious(createWrite({ payload: { fileId: SECOND_FILE_ID, sizeBytes: 51_002, contentType: 'application/xml' } }));

      expect(result).toEqual({ previousFileId: FIRST_FILE_ID });
    });

    test('Points the entry at the new file when overwriting it, keeping a single row', async () => {
      await index.upsertReturningPrevious(createWrite({ payload: { fileId: FIRST_FILE_ID, sizeBytes: 48_213, contentType: 'application/xml' } }));

      await index.upsertReturningPrevious(createWrite({ payload: { fileId: SECOND_FILE_ID, sizeBytes: 51_002, contentType: 'application/xml' } }));

      const row = await findRequired();
      expect(row.fileId).toBe(SECOND_FILE_ID);
      expect(row.sizeBytes).toBe(51_002);
      await expect(databaseClient.cacheAppEntry.count({ where: { namespace } })).resolves.toBe(1);
    });

    test('Moves the creation date forward when overwriting an entry', async () => {
      await index.upsertReturningPrevious(createWrite({ writtenAt: new Date('2026-10-01T08:00:00Z') }));

      await index.upsertReturningPrevious(createWrite({
        payload: { fileId: SECOND_FILE_ID, sizeBytes: 51_002, contentType: 'application/xml' },
        writtenAt: new Date('2026-10-05T12:30:00Z'),
      }));

      const row = await findRequired();
      expect(row.createdAt).toEqual(new Date('2026-10-05T12:30:00Z'));
    });

    test('Stores a cached null without a file and with a size of zero', async () => {
      await index.upsertReturningPrevious(createWrite({ payload: null }));

      const row = await findRequired();

      expect(row.isNull).toBe(true);
      expect(row.fileId).toBeNull();
      expect(row.sizeBytes).toBe(0);
      expect(row.contentType).toBeNull();
    });

    test('Reports the replaced file when a value is overwritten by a cached null', async () => {
      await index.upsertReturningPrevious(createWrite());

      await expect(index.upsertReturningPrevious(createWrite({ payload: null }))).resolves.toEqual({ previousFileId: FIRST_FILE_ID });
    });

    test('Reports every replaced file to exactly one of several concurrent overwrites', async () => {
      await index.upsertReturningPrevious(createWrite({ payload: { fileId: FIRST_FILE_ID, sizeBytes: 48_213, contentType: 'application/xml' } }));
      const newFileIds = Array.from({ length: 5 }, () => Crypto.randomUUID());

      const results = await Promise.all(newFileIds.map((fileId) => index.upsertReturningPrevious(
        createWrite({ payload: { fileId, sizeBytes: 48_213, contentType: 'application/xml' } }),
      )));

      const previousFileIds = results.map((result) => result.previousFileId);
      expect(new Set(previousFileIds).size).toBe(5);
      expect(previousFileIds).toContain(FIRST_FILE_ID);
    });

    test('Rejects a write whose file id another entry already uses', async () => {
      await index.upsertReturningPrevious(createWrite({ key: '17' }));

      await expect(index.upsertReturningPrevious(createWrite({ key: '18' }))).rejects.toThrow(expect.objectContaining({ code: 'P2002' }));
    });
  });

  describe('deleting an exact entry', () => {
    test('Deletes the entry when it still points to the same file', async () => {
      await index.upsertReturningPrevious(createWrite());
      const row = await findRequired();

      await expect(index.deleteExact(row)).resolves.toBe(true);
      await expect(index.find(namespace, 1, '17')).resolves.toBeNull();
    });

    test('Keeps an entry that was overwritten after it was read', async () => {
      await index.upsertReturningPrevious(createWrite({ payload: { fileId: FIRST_FILE_ID, sizeBytes: 48_213, contentType: 'application/xml' } }));
      const staleRow = await findRequired();
      await index.upsertReturningPrevious(createWrite({ payload: { fileId: SECOND_FILE_ID, sizeBytes: 51_002, contentType: 'application/xml' } }));

      const deleted = await index.deleteExact(staleRow);

      expect(deleted).toBe(false);
      await expect(findRequired()).resolves.toMatchObject({ fileId: SECOND_FILE_ID });
    });

    test('Keeps a cached null that was written again after it was read', async () => {
      await index.upsertReturningPrevious(createWrite({ payload: null, writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const staleRow = await findRequired();
      await index.upsertReturningPrevious(createWrite({ payload: null, writtenAt: new Date('2026-10-02T08:00:00Z') }));

      const deleted = await index.deleteExact(staleRow);

      expect(deleted).toBe(false);
      await expect(findRequired()).resolves.toMatchObject({ isNull: true, createdAt: new Date('2026-10-02T08:00:00Z') });
    });

    test('Deletes a cached null', async () => {
      await index.upsertReturningPrevious(createWrite({ payload: null }));
      const row = await findRequired();

      await expect(index.deleteExact(row)).resolves.toBe(true);
      await expect(index.find(namespace, 1, '17')).resolves.toBeNull();
    });

    test('Deletes an entry whose creation date the database set', async () => {
      await databaseClient.$executeRaw`INSERT INTO cache_app_entries (namespace, version, key, is_null, size_bytes) VALUES (${namespace}, 1, '17', true, 0)`;
      const row = await findRequired();

      await expect(index.deleteExact(row)).resolves.toBe(true);
      await expect(index.find(namespace, 1, '17')).resolves.toBeNull();
    });

    test('Reports nothing deleted when the entry is already gone', async () => {
      await index.upsertReturningPrevious(createWrite());
      const row = await findRequired();
      await index.deleteExact(row);

      await expect(index.deleteExact(row)).resolves.toBe(false);
    });
  });

  describe('touching an entry', () => {
    test('Moves the last access date to the present', async () => {
      await index.upsertReturningPrevious(createWrite({ writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const row = await findRequired();
      const before = new Date();

      await index.touch(row.id);

      const touchedRow = await findRequired();
      expect(touchedRow.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    test('Takes the last access date from the database clock, not from Apollo\'s', async () => {
      await index.upsertReturningPrevious(createWrite({ writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const row = await findRequired();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));

      await index.touch(row.id);

      expect((await findRequired()).lastAccessedAt.getTime()).toBeGreaterThan(new Date('2026-10-01T08:00:00Z').getTime());
    });

    test('Leaves the creation date unchanged', async () => {
      await index.upsertReturningPrevious(createWrite({ writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const row = await findRequired();

      await index.touch(row.id);

      await expect(findRequired()).resolves.toMatchObject({ createdAt: new Date('2026-10-01T08:00:00Z') });
    });

    test('Succeeds when the entry has been deleted in the meantime', async () => {
      await index.upsertReturningPrevious(createWrite());
      const row = await findRequired();
      await index.deleteExact(row);

      await expect(index.touch(row.id)).resolves.toBeUndefined();
    });
  });
});
