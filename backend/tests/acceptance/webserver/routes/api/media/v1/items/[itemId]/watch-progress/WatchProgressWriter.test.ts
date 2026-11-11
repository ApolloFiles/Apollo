import { BadRequestError, NotFoundError } from '@sprax/node-framework';
import DatabaseClient from '#src/database/DatabaseClient.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { WatchProgressWriter } from '#src/webserver/routes/api/media/v1/items/[itemId]/watch-progress/WatchProgressWriter.js';

const DURATION = 1440;

describe(WatchProgressWriter, () => {
  let databaseClient: DatabaseClient;
  let writer: WatchProgressWriter;
  let alice: ApolloUser;
  let carolId: string;
  let dayANewDemonWasBornId: bigint;
  let vacationId: bigint;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    writer = new WatchProgressWriter(databaseClient);

    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    carolId = (await databaseClient.authUser.create({ data: { displayName: 'Carol' } })).id;
    dayANewDemonWasBornId = await createItem(alice.id, 'Code Geass: Hangyaku no Lelouch', 'S01E01.mkv');
    vacationId = await createItem(carolId, 'Home Videos', 'Vacation.mkv');
  });

  afterEach(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, carolId] } } });
  });

  async function createItem(ownerId: string, mediaTitle: string, file: string): Promise<bigint> {
    const library = await databaseClient.mediaLibrary.create({ data: { ownerId, name: 'Library', directoryUris: [] } });
    const media = await databaseClient.mediaLibraryMedia.create({
      data: {
        libraryId: library.id,
        title: mediaTitle,
        year: 1998,
        directoryUri: `apollo:///f/${library.id}/local/${encodeURIComponent(mediaTitle)}`,
        items: { create: [{ relativeFilePath: file, durationInSec: DURATION, title: mediaTitle, synopsis: null }] },
      },
      select: { items: { select: { id: true } } },
    });
    return media.items[0]!.id;
  }

  async function progressOf(userId: string, itemId: bigint): Promise<number | null> {
    const row = await databaseClient.mediaLibraryUserWatchProgress.findUnique({ where: { userId_mediaItemId: { userId, mediaItemId: itemId } } });
    return row?.durationInSec ?? null;
  }

  describe('when saving', () => {
    test('Stores the position of an item that has none yet', async () => {
      await writer.save(alice, dayANewDemonWasBornId, 754, undefined);

      await expect(progressOf(alice.id, dayANewDemonWasBornId)).resolves.toBe(754);
    });

    test('Replaces an earlier position, even with a smaller one', async () => {
      await databaseClient.mediaLibraryUserWatchProgress.create({ data: { userId: alice.id, mediaItemId: dayANewDemonWasBornId, durationInSec: 1200 } });

      await writer.save(alice, dayANewDemonWasBornId, 300, undefined);

      await expect(progressOf(alice.id, dayANewDemonWasBornId)).resolves.toBe(300);
    });

    test('Stores a position beyond the end as the duration', async () => {
      await writer.save(alice, dayANewDemonWasBornId, 1441, undefined);

      await expect(progressOf(alice.id, dayANewDemonWasBornId)).resolves.toBe(DURATION);
    });

    test('Accepts the item\'s own file as the file the position refers to', async () => {
      await writer.save(alice, dayANewDemonWasBornId, 754, dayANewDemonWasBornId);

      await expect(progressOf(alice.id, dayANewDemonWasBornId)).resolves.toBe(754);
    });

    test('Rejects a file of another item and stores nothing', async () => {
      const otherItemId = await createItem(alice.id, 'No Game No Life: Zero', 'No Game No Life: Zero.mkv');

      await expect(writer.save(alice, dayANewDemonWasBornId, 754, otherItemId))
        .rejects.toThrow(new BadRequestError(`File '${otherItemId}' does not belong to item '${dayANewDemonWasBornId}'`));
      await expect(progressOf(alice.id, dayANewDemonWasBornId)).resolves.toBeNull();
    });

    test('Stores the position of an item in a library shared with the user', async () => {
      const vacation = await databaseClient.mediaLibraryMediaItem.findUniqueOrThrow({ where: { id: vacationId }, select: { media: { select: { libraryId: true } } } });
      await databaseClient.mediaLibrarySharedWith.create({ data: { libraryId: vacation.media.libraryId, userId: alice.id } });

      await writer.save(alice, vacationId, 754, undefined);

      await expect(progressOf(alice.id, vacationId)).resolves.toBe(754);
    });

    test('Reports an item whose file is missing as not found and stores nothing', async () => {
      await databaseClient.mediaLibraryMediaItem.update({ where: { id: dayANewDemonWasBornId }, data: { missingSince: new Date('2026-11-05T03:00:00.000Z') } });

      await expect(writer.save(alice, dayANewDemonWasBornId, 754, undefined)).rejects.toThrow(NotFoundError);
      await expect(progressOf(alice.id, dayANewDemonWasBornId)).resolves.toBeNull();
    });

    test('Reports an item of another user\'s library as not found and stores nothing', async () => {
      await expect(writer.save(alice, vacationId, 754, undefined))
        .rejects.toThrow(new NotFoundError(`Item '${vacationId}' does not exist or you do not have access to it`));
      await expect(progressOf(alice.id, vacationId)).resolves.toBeNull();
    });
  });

  describe('when forgetting', () => {
    test('Removes the user\'s position and leaves the positions of others alone', async () => {
      const vacation = await databaseClient.mediaLibraryMediaItem.findUniqueOrThrow({ where: { id: vacationId }, select: { media: { select: { libraryId: true } } } });
      await databaseClient.mediaLibrarySharedWith.create({ data: { libraryId: vacation.media.libraryId, userId: alice.id } });
      await databaseClient.mediaLibraryUserWatchProgress.createMany({
        data: [
          { userId: alice.id, mediaItemId: vacationId, durationInSec: 600 },
          { userId: carolId, mediaItemId: vacationId, durationInSec: 900 },
        ],
      });

      await writer.remove(alice, vacationId);

      await expect(progressOf(alice.id, vacationId)).resolves.toBeNull();
      await expect(progressOf(carolId, vacationId)).resolves.toBe(900);
    });

    test('Succeeds when there is no position to remove', async () => {
      await expect(writer.remove(alice, dayANewDemonWasBornId)).resolves.toBeUndefined();
    });

    test('Reports an item of another user\'s library as not found and leaves its positions alone', async () => {
      await databaseClient.mediaLibraryUserWatchProgress.create({ data: { userId: carolId, mediaItemId: vacationId, durationInSec: 900 } });

      await expect(writer.remove(alice, vacationId)).rejects.toThrow(NotFoundError);
      await expect(progressOf(carolId, vacationId)).resolves.toBe(900);
    });
  });

  test('Reports an unknown item as not found', async () => {
    await expect(writer.save(alice, 7303000000000000009n, 754, undefined)).rejects.toThrow(NotFoundError);
  });
});
