import { NotFoundError } from '@sprax/node-framework';
import DatabaseClient from '#src/database/DatabaseClient.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { ItemDetailQuery } from '#src/webserver/routes/api/media/v1/items/[itemId]/ItemDetailQuery.js';

type ItemSpec = { file: string, title: string, seasonNumber?: number, episodeNumber?: number };

const EPISODE_DURATION = 1440;

describe(ItemDetailQuery, () => {
  let databaseClient: DatabaseClient;
  let query: ItemDetailQuery;
  let alice: ApolloUser;
  let carolId: string;
  let animeLibraryId: bigint;
  let carolsLibraryId: bigint;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    query = new ItemDetailQuery(databaseClient);

    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    carolId = (await databaseClient.authUser.create({ data: { displayName: 'Carol' } })).id;
    animeLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Anime', directoryUris: [] } })).id;
    carolsLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: carolId, name: 'Private', directoryUris: [] } })).id;
  });

  afterEach(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, carolId] } } });
  });

  async function createMedia(libraryId: bigint, title: string, items: ItemSpec[]): Promise<{ id: bigint, itemIds: Record<string, bigint> }> {
    const media = await databaseClient.mediaLibraryMedia.create({
      data: {
        libraryId,
        title,
        year: 1998,
        directoryUri: `apollo:///f/${libraryId}/local/${encodeURIComponent(title)}`,
        items: {
          create: items.map((item) => ({
            relativeFilePath: item.file,
            durationInSec: EPISODE_DURATION,
            title: item.title,
            synopsis: null,
            seasonNumber: item.seasonNumber ?? null,
            episodeNumber: item.episodeNumber ?? null,
          })),
        },
      },
      select: { id: true, items: { select: { id: true, relativeFilePath: true } } },
    });
    return {
      id: media.id,
      itemIds: Object.fromEntries(media.items.map((item) => [item.relativeFilePath, item.id])),
    };
  }

  test('Describes an episode of a show with its numbering and the name of its file without the directory', async () => {
    const codeGeass = await createMedia(animeLibraryId, 'Code Geass: Hangyaku no Lelouch', [
      { file: 'Season 1/Code Geass - S01E01 - The Day a New Demon Was Born.mkv', title: 'The Day a New Demon Was Born', seasonNumber: 1, episodeNumber: 1 },
    ]);
    const itemId = codeGeass.itemIds['Season 1/Code Geass - S01E01 - The Day a New Demon Was Born.mkv']!;

    const item = await query.run(alice, itemId);

    expect(item).toStrictEqual({
      id: itemId.toString(),
      mediaId: codeGeass.id.toString(),
      kind: 'episode',
      title: 'The Day a New Demon Was Born',
      synopsis: null,
      seasonNumber: 1,
      episodeNumber: 1,
      durationSeconds: EPISODE_DURATION,
      me: { watchProgress: null },
      files: [{ id: itemId.toString(), fileName: 'Code Geass - S01E01 - The Day a New Demon Was Born.mkv', durationSeconds: EPISODE_DURATION }],
    });
  });

  test('Describes an unnumbered item of a show as an episode, not as a movie', async () => {
    const codeGeass = await createMedia(animeLibraryId, 'Code Geass: Hangyaku no Lelouch', [
      { file: 'S01E01.mkv', title: 'The Day a New Demon Was Born', seasonNumber: 1, episodeNumber: 1 },
      { file: 'Extras.mkv', title: 'Extras' },
    ]);

    const item = await query.run(alice, codeGeass.itemIds['Extras.mkv']!);

    expect(item).toMatchObject({ kind: 'episode', title: 'Extras' });
    expect(item).not.toHaveProperty('seasonNumber');
  });

  test('Describes the item of a movie as a movie', async () => {
    const noGameNoLifeZero = await createMedia(animeLibraryId, 'No Game No Life: Zero', [{ file: 'No Game No Life: Zero.mkv', title: 'No Game No Life: Zero' }]);

    await expect(query.run(alice, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!)).resolves.toMatchObject({ kind: 'movie', files: [{ fileName: 'No Game No Life: Zero.mkv' }] });
  });

  test('Reports only the requesting user\'s watch progress', async () => {
    const noGameNoLifeZero = await createMedia(animeLibraryId, 'No Game No Life: Zero', [{ file: 'No Game No Life: Zero.mkv', title: 'No Game No Life: Zero' }]);
    const itemId = noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!;
    const progress = await databaseClient.mediaLibraryUserWatchProgress.create({ data: { userId: alice.id, mediaItemId: itemId, durationInSec: 600 } });
    await databaseClient.mediaLibraryUserWatchProgress.create({ data: { userId: carolId, mediaItemId: itemId, durationInSec: 900 } });

    const item = await query.run(alice, itemId);

    expect(item.me.watchProgress).toEqual({ positionSeconds: 600, updatedAt: progress.updatedAt.toISOString() });
  });

  test('Describes an item of a library shared with the user', async () => {
    const homeVideos = await createMedia(carolsLibraryId, 'Home Videos', [{ file: 'Vacation.mkv', title: 'Vacation' }]);
    await databaseClient.mediaLibrarySharedWith.create({ data: { libraryId: carolsLibraryId, userId: alice.id } });

    await expect(query.run(alice, homeVideos.itemIds['Vacation.mkv']!)).resolves.toMatchObject({ title: 'Vacation' });
  });

  test('Reports an item of another user\'s library as not found', async () => {
    const homeVideos = await createMedia(carolsLibraryId, 'Home Videos', [{ file: 'Vacation.mkv', title: 'Vacation' }]);
    const itemId = homeVideos.itemIds['Vacation.mkv']!;

    await expect(query.run(alice, itemId)).rejects.toThrow(new NotFoundError(`Item '${itemId}' does not exist or you do not have access to it`));
  });

  test('Reports an unknown item as not found', async () => {
    await expect(query.run(alice, 7303000000000000009n)).rejects.toThrow(NotFoundError);
  });
});
