import type { CacheIndexRow } from '#src/cache/internal/database/CacheIndexRow.js';
import type { CacheIndexWrite } from '#src/cache/internal/database/CacheIndexWrite.js';
import { type BoundUserCacheIndex, UserCacheIndex } from '#src/cache/internal/database/UserCacheIndex.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import Crypto from 'node:crypto';

const FILE_ID_1 = '5a9e3c1b-7d24-4f8a-b6e0-2c4d8f1a3b97';
const FILE_ID_2 = '9d1f6b3e-0c87-4a52-8e9d-4b7c2a6f1e03';
const FILE_ID_3 = 'e2b84d07-5f1c-4c39-a7d6-8f0e3b9c5a21';
const FILE_ID_4 = '1c7a5e92-3b6d-4e08-9f2a-6d1b8c4e7f35';

describe(UserCacheIndex, () => {
  let databaseClient: DatabaseClient;
  let aliceId: string;
  let bobId: string;
  let namespace: string;
  let alice: BoundUserCacheIndex;
  let bob: BoundUserCacheIndex;

  beforeAll(async () => {
    databaseClient = new DatabaseClient();
    aliceId = (await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id;
    bobId = (await databaseClient.authUser.create({ data: { displayName: 'Bob' } })).id;
  });

  afterAll(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [aliceId, bobId] } } });
    await databaseClient.$disconnect();
  });

  beforeEach(() => {
    // Test files share the database, so every test works in a namespace of its own
    namespace = `media.thumbnail.${Crypto.randomUUID()}`;
    const userCacheIndex = new UserCacheIndex(databaseClient);
    alice = userCacheIndex.forUser(aliceId);
    bob = userCacheIndex.forUser(bobId);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await databaseClient.cacheUserEntry.deleteMany({ where: { namespace } });
  });

  function createWrite(overrides: Partial<CacheIndexWrite> = {}): CacheIndexWrite {
    return {
      namespace,
      version: 1,
      key: 'default:/movies/Arrival (2016)/Arrival.mkv|avif',
      groupKey: 'default:/movies/Arrival (2016)/Arrival.mkv',
      validator: '8123456789;1759305600000',
      payload: { fileId: FILE_ID_1, sizeBytes: 18_442, contentType: 'image/avif' },
      writtenAt: new Date('2026-10-01T08:00:00Z'),
      freshUntil: null,
      keepUntil: null,
      ...overrides,
    };
  }

  async function writeToGroup(index: BoundUserCacheIndex, groupKey: string, fileId: string, overrides: Partial<CacheIndexWrite> = {}): Promise<void> {
    await index.upsertReturningPrevious(createWrite({
      key: `${groupKey}|avif`,
      groupKey,
      payload: { fileId, sizeBytes: 18_442, contentType: 'image/avif' },
      ...overrides,
    }));
  }

  async function findRequired(index: BoundUserCacheIndex, key = 'default:/movies/Arrival (2016)/Arrival.mkv|avif'): Promise<CacheIndexRow> {
    const row = await index.find(namespace, 1, key);
    expect(row).not.toBeNull();
    return row!;
  }

  async function remainingGroupKeys(): Promise<string[]> {
    const entries = await databaseClient.cacheUserEntry.findMany({ where: { namespace }, select: { groupKey: true } });
    return entries.map((entry) => entry.groupKey!).sort();
  }

  describe('the scoped operations', () => {
    test('Returns the written entry together with its user', async () => {
      await alice.upsertReturningPrevious(createWrite());

      await expect(alice.find(namespace, 1, 'default:/movies/Arrival (2016)/Arrival.mkv|avif')).resolves.toEqual({
        id: expect.any(BigInt),
        userId: aliceId,
        namespace,
        version: 1,
        key: 'default:/movies/Arrival (2016)/Arrival.mkv|avif',
        fileId: FILE_ID_1,
        isNull: false,
        groupKey: 'default:/movies/Arrival (2016)/Arrival.mkv',
        sizeBytes: 18_442,
        contentType: 'image/avif',
        validator: '8123456789;1759305600000',
        createdAt: new Date('2026-10-01T08:00:00Z'),
        freshUntil: null,
        keepUntil: null,
        lastAccessedAt: new Date('2026-10-01T08:00:00Z'),
      });
    });

    test('Reports the replaced file when overwriting an entry', async () => {
      await alice.upsertReturningPrevious(createWrite({ payload: { fileId: FILE_ID_1, sizeBytes: 18_442, contentType: 'image/avif' } }));

      const result = await alice.upsertReturningPrevious(createWrite({ payload: { fileId: FILE_ID_2, sizeBytes: 19_005, contentType: 'image/avif' } }));

      expect(result).toEqual({ previousFileId: FILE_ID_1 });
    });

    test('Deletes the entry when it still points to the same file', async () => {
      await alice.upsertReturningPrevious(createWrite());
      const row = await findRequired(alice);

      await expect(alice.deleteExact(row)).resolves.toBe(true);
      await expect(alice.find(namespace, 1, 'default:/movies/Arrival (2016)/Arrival.mkv|avif')).resolves.toBeNull();
    });

    test('Deletes an entry whose creation date the database set', async () => {
      await databaseClient.$executeRaw`INSERT INTO cache_user_entries (user_id, namespace, version, key, is_null, size_bytes) VALUES (${aliceId}, ${namespace}, 1, 'default:/movies/Arrival (2016)/Arrival.mkv|avif', true, 0)`;
      const row = await findRequired(alice);

      await expect(alice.deleteExact(row)).resolves.toBe(true);
      await expect(alice.find(namespace, 1, 'default:/movies/Arrival (2016)/Arrival.mkv|avif')).resolves.toBeNull();
    });

    test('Keeps an entry that was overwritten after it was read', async () => {
      await alice.upsertReturningPrevious(createWrite({ payload: { fileId: FILE_ID_1, sizeBytes: 18_442, contentType: 'image/avif' } }));
      const staleRow = await findRequired(alice);
      await alice.upsertReturningPrevious(createWrite({ payload: { fileId: FILE_ID_2, sizeBytes: 19_005, contentType: 'image/avif' } }));

      await expect(alice.deleteExact(staleRow)).resolves.toBe(false);
    });

    test('Keeps a cached null that was written again after it was read', async () => {
      await alice.upsertReturningPrevious(createWrite({ payload: null, writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const staleRow = await findRequired(alice);
      await alice.upsertReturningPrevious(createWrite({ payload: null, writtenAt: new Date('2026-10-02T08:00:00Z') }));

      await expect(alice.deleteExact(staleRow)).resolves.toBe(false);
    });

    test('Reports every replaced file to exactly one of several concurrent overwrites', async () => {
      await alice.upsertReturningPrevious(createWrite({ payload: { fileId: FILE_ID_1, sizeBytes: 18_442, contentType: 'image/avif' } }));
      const newFileIds = Array.from({ length: 5 }, () => Crypto.randomUUID());

      const results = await Promise.all(newFileIds.map((fileId) => alice.upsertReturningPrevious(
        createWrite({ payload: { fileId, sizeBytes: 18_442, contentType: 'image/avif' } }),
      )));

      const previousFileIds = results.map((result) => result.previousFileId);
      expect(new Set(previousFileIds).size).toBe(5);
      expect(previousFileIds).toContain(FILE_ID_1);
    });

    test('Takes the last access date from the database clock, not from Apollo\'s', async () => {
      await alice.upsertReturningPrevious(createWrite({ writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const row = await findRequired(alice);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));

      await alice.touch(row.id);

      expect((await findRequired(alice)).lastAccessedAt.getTime()).toBeGreaterThan(new Date('2026-10-01T08:00:00Z').getTime());
    });

    test('Moves the last access date to the present when touching an entry', async () => {
      await alice.upsertReturningPrevious(createWrite({ writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const row = await findRequired(alice);
      const before = new Date();

      await alice.touch(row.id);

      const touchedRow = await findRequired(alice);
      expect(touchedRow.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('user isolation', () => {
    test('Does not find an entry another user wrote under the same key', async () => {
      await alice.upsertReturningPrevious(createWrite());

      await expect(bob.find(namespace, 1, 'default:/movies/Arrival (2016)/Arrival.mkv|avif')).resolves.toBeNull();
    });

    test('Keeps separate entries for two users writing the same key', async () => {
      await alice.upsertReturningPrevious(createWrite({ payload: { fileId: FILE_ID_1, sizeBytes: 18_442, contentType: 'image/avif' } }));

      const result = await bob.upsertReturningPrevious(createWrite({ payload: { fileId: FILE_ID_2, sizeBytes: 19_005, contentType: 'image/avif' } }));

      expect(result).toEqual({ previousFileId: null });
      await expect(findRequired(alice)).resolves.toMatchObject({ fileId: FILE_ID_1 });
      await expect(findRequired(bob)).resolves.toMatchObject({ fileId: FILE_ID_2 });
    });

    test('Does not delete another user\'s entry, even given its exact row', async () => {
      await alice.upsertReturningPrevious(createWrite());
      const aliceRow = await findRequired(alice);

      const deleted = await bob.deleteExact(aliceRow);

      expect(deleted).toBe(false);
      await expect(alice.find(namespace, 1, 'default:/movies/Arrival (2016)/Arrival.mkv|avif')).resolves.not.toBeNull();
    });

    test('Does not touch another user\'s entry', async () => {
      await alice.upsertReturningPrevious(createWrite({ writtenAt: new Date('2026-10-01T08:00:00Z') }));
      const aliceRow = await findRequired(alice);

      await bob.touch(aliceRow.id);

      await expect(findRequired(alice)).resolves.toMatchObject({ lastAccessedAt: new Date('2026-10-01T08:00:00Z') });
    });

    test('Does not delete another user\'s group with the same key', async () => {
      await writeToGroup(alice, 'default:/movies/Arrival (2016)/Arrival.mkv', FILE_ID_1);
      await writeToGroup(bob, 'default:/movies/Arrival (2016)/Arrival.mkv', FILE_ID_2);

      await bob.deleteGroup(namespace, 'default:/movies/Arrival (2016)/Arrival.mkv');

      await expect(findRequired(alice)).resolves.toMatchObject({ fileId: FILE_ID_1 });
    });

    test('Does not delete another user\'s entries matching the same prefix', async () => {
      await writeToGroup(alice, 'default:/movies/Arrival (2016)/Arrival.mkv', FILE_ID_1);

      await bob.deleteGroupPrefix(namespace, 'default:/movies/');

      await expect(findRequired(alice)).resolves.toMatchObject({ fileId: FILE_ID_1 });
    });
  });

  describe('deleting a group', () => {
    test('Deletes every entry of the group and returns their file locations', async () => {
      await alice.upsertReturningPrevious(createWrite({ key: 'default:/movies/Arrival.mkv|avif', groupKey: 'default:/movies/Arrival.mkv', payload: { fileId: FILE_ID_1, sizeBytes: 18_442, contentType: 'image/avif' } }));
      await alice.upsertReturningPrevious(createWrite({ key: 'default:/movies/Arrival.mkv|jpeg', groupKey: 'default:/movies/Arrival.mkv', payload: { fileId: FILE_ID_2, sizeBytes: 31_870, contentType: 'image/jpeg' } }));

      const deletedRows = await alice.deleteGroup(namespace, 'default:/movies/Arrival.mkv');

      expect(deletedRows.toSorted((a, b) => a.fileId!.localeCompare(b.fileId!))).toEqual([
        { userId: aliceId, namespace, version: 1, fileId: FILE_ID_1 },
        { userId: aliceId, namespace, version: 1, fileId: FILE_ID_2 },
      ]);
      await expect(remainingGroupKeys()).resolves.toEqual([]);
    });

    test('Deletes the group\'s entries of older versions too', async () => {
      await writeToGroup(alice, 'default:/movies/Arrival.mkv', FILE_ID_1, { version: 1 });
      await writeToGroup(alice, 'default:/movies/Arrival.mkv', FILE_ID_2, { version: 2 });

      const deletedRows = await alice.deleteGroup(namespace, 'default:/movies/Arrival.mkv');

      expect(deletedRows.map((row) => row.version).sort()).toEqual([1, 2]);
    });

    test('Returns a cached null without a file id', async () => {
      await writeToGroup(alice, 'default:/movies/Broken.mkv', FILE_ID_1, { payload: null });

      const deletedRows = await alice.deleteGroup(namespace, 'default:/movies/Broken.mkv');

      expect(deletedRows).toEqual([{ userId: aliceId, namespace, version: 1, fileId: null }]);
    });

    test('Keeps entries of other groups, including groups the key is a prefix of', async () => {
      await writeToGroup(alice, 'default:/movies/Arrival.mkv', FILE_ID_1);
      await writeToGroup(alice, 'default:/movies/Arrival.mkv.part', FILE_ID_2);

      await alice.deleteGroup(namespace, 'default:/movies/Arrival.mkv');

      await expect(remainingGroupKeys()).resolves.toEqual(['default:/movies/Arrival.mkv.part']);
    });

    test('Keeps entries of the same group in other namespaces', async ({ onTestFinished }) => {
      const otherNamespace = `media.poster.${Crypto.randomUUID()}`;
      onTestFinished(async () => {
        await databaseClient.cacheUserEntry.deleteMany({ where: { namespace: otherNamespace } });
      });
      await writeToGroup(alice, 'default:/movies/Arrival.mkv', FILE_ID_1, { namespace: otherNamespace });

      await alice.deleteGroup(namespace, 'default:/movies/Arrival.mkv');

      await expect(alice.find(otherNamespace, 1, 'default:/movies/Arrival.mkv|avif')).resolves.not.toBeNull();
    });
  });

  describe('deleting a group prefix', () => {
    test('Deletes every group below a directory, at any depth', async () => {
      await writeToGroup(alice, 'default:/movies/Arrival (2016)/Arrival.mkv', FILE_ID_1);
      await writeToGroup(alice, 'default:/movies/Arrival (2016)/Extras/Interview.mkv', FILE_ID_2);
      await writeToGroup(alice, 'default:/series/Severance/S01E01.mkv', FILE_ID_3);

      await alice.deleteGroupPrefix(namespace, 'default:/movies/Arrival (2016)/');

      await expect(remainingGroupKeys()).resolves.toEqual(['default:/series/Severance/S01E01.mkv']);
    });

    test('Keeps a sibling directory whose name starts with the same characters', async () => {
      await writeToGroup(alice, 'default:/movies/Foo/Foo.mkv', FILE_ID_1);
      await writeToGroup(alice, 'default:/movies/Foobar/Foobar.mkv', FILE_ID_2);

      await alice.deleteGroupPrefix(namespace, 'default:/movies/Foo/');

      await expect(remainingGroupKeys()).resolves.toEqual(['default:/movies/Foobar/Foobar.mkv']);
    });

    test.for([
      { wildcard: '%', prefix: 'default:/movies/100%/', lookalike: 'default:/movies/100 Days/Day1.mkv' },
      { wildcard: '_', prefix: 'default:/movies/A_B/', lookalike: 'default:/movies/AxB/AxB.mkv' },
      { wildcard: '\\', prefix: 'default:/movies/A\\%B/', lookalike: 'default:/movies/A\\xyzB/AB.mkv' },
    ])('Treats $wildcard in the prefix literally', async ({ prefix, lookalike }) => {
      await writeToGroup(alice, `${prefix}Movie.mkv`, FILE_ID_1);
      await writeToGroup(alice, lookalike, FILE_ID_2);

      await alice.deleteGroupPrefix(namespace, prefix);

      await expect(remainingGroupKeys()).resolves.toEqual([lookalike]);
    });

    test('Deletes a whole file system with the bare file system prefix', async () => {
      await writeToGroup(alice, 'default:/movies/Arrival.mkv', FILE_ID_1);
      await writeToGroup(alice, 'default:/series/Severance/S01E01.mkv', FILE_ID_2);
      await writeToGroup(alice, 'nas-archive:/movies/Arrival.mkv', FILE_ID_3);

      await alice.deleteGroupPrefix(namespace, 'default:');

      await expect(remainingGroupKeys()).resolves.toEqual(['nas-archive:/movies/Arrival.mkv']);
    });

    test('Keeps entries without a group', async () => {
      await alice.upsertReturningPrevious(createWrite({ key: 'default:/movies/Arrival.mkv|avif', groupKey: null, payload: { fileId: FILE_ID_4, sizeBytes: 18_442, contentType: 'image/avif' } }));

      await alice.deleteGroupPrefix(namespace, 'default:');

      await expect(alice.find(namespace, 1, 'default:/movies/Arrival.mkv|avif')).resolves.not.toBeNull();
    });
  });
});
