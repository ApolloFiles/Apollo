import DatabaseClient from '#src/database/DatabaseClient.js';
import ContinueWatchingProvider from '#src/plugins/official/media/library/ContinueWatchingProvider.js';
import MediaLibraryByUserFinder from '#src/plugins/official/media/library/database/library/MediaLibraryByUserFinder.js';
import MediaLibraryMediaItemFinder from '#src/plugins/official/media/library/database/media-item/MediaLibraryMediaItemFinder.js';
import MediaLibraryMediaFinder from '#src/plugins/official/media/library/database/media/MediaLibraryMediaFinder.js';
import WatchProgressFinder from '#src/plugins/official/media/library/database/watch-progress/WatchProgressFinder.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { ContinueWatchingQuery } from '#src/webserver/routes/api/media/v1/me/continue-watching/ContinueWatchingQuery.js';

type ItemSpec = { file: string, title: string, seasonNumber?: number, episodeNumber?: number };
type CreatedMedia = { id: bigint, itemIds: Record<string, bigint> };

const DURATION = 1440;

describe(ContinueWatchingQuery, () => {
  let databaseClient: DatabaseClient;
  let continueWatchingProvider: ContinueWatchingProvider;
  let query: ContinueWatchingQuery;
  let alice: ApolloUser;
  let carolId: string;
  let animeLibraryId: bigint;
  let moviesLibraryId: bigint;
  let carolsLibraryId: bigint;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    continueWatchingProvider = new ContinueWatchingProvider(
      new WatchProgressFinder(databaseClient),
      new MediaLibraryMediaItemFinder(databaseClient),
      new MediaLibraryByUserFinder(databaseClient),
      new MediaLibraryMediaFinder(databaseClient),
    );
    query = new ContinueWatchingQuery(databaseClient, continueWatchingProvider);

    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    carolId = (await databaseClient.authUser.create({ data: { displayName: 'Carol' } })).id;
    animeLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Anime', directoryUris: [] } })).id;
    moviesLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Movies', directoryUris: [] } })).id;
    carolsLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: carolId, name: 'Private', directoryUris: [] } })).id;
  });

  afterEach(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, carolId] } } });
  });

  async function createMedia(libraryId: bigint, title: string, items: ItemSpec[]): Promise<CreatedMedia> {
    const media = await databaseClient.mediaLibraryMedia.create({
      data: {
        libraryId,
        title,
        year: 2017,
        directoryUri: `apollo:///f/${libraryId}/local/${encodeURIComponent(title)}`,
        items: {
          create: items.map((item) => ({
            relativeFilePath: item.file,
            durationInSec: DURATION,
            title: item.title,
            synopsis: null,
            seasonNumber: item.seasonNumber ?? null,
            episodeNumber: item.episodeNumber ?? null,
          })),
        },
      },
      select: { id: true, items: { select: { id: true, relativeFilePath: true } } },
    });
    return { id: media.id, itemIds: Object.fromEntries(media.items.map((item) => [item.relativeFilePath, item.id])) };
  }

  async function createMovie(libraryId: bigint, title: string): Promise<CreatedMedia> {
    return createMedia(libraryId, title, [{ file: `${title}.mkv`, title }]);
  }

  async function createCodeGeass(): Promise<CreatedMedia> {
    return createMedia(animeLibraryId, 'Code Geass: Hangyaku no Lelouch', [
      { file: 'S01E01.mkv', title: 'The Day a New Demon Was Born', seasonNumber: 1, episodeNumber: 1 },
      { file: 'S01E02.mkv', title: 'The White Knight Awakens', seasonNumber: 1, episodeNumber: 2 },
    ]);
  }

  async function recordProgress(userId: string, itemId: bigint, positionSeconds: number, updatedAt: string): Promise<void> {
    await databaseClient.mediaLibraryUserWatchProgress.create({
      data: { userId, mediaItemId: itemId, durationInSec: positionSeconds, updatedAt: new Date(updatedAt) },
    });
  }

  async function markMissing(itemId: bigint): Promise<void> {
    await databaseClient.mediaLibraryMediaItem.update({ where: { id: itemId }, data: { missingSince: new Date('2026-11-05T03:00:00.000Z') } });
  }

  function list(limit = 20, libraryIds: bigint[] = []) {
    return query.run(alice, { libraryIds, limit });
  }

  test('Describes the media and the item the user is in the middle of', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');

    const page = await list();

    expect(page).toStrictEqual({
      items: [{
        media: { id: noGameNoLifeZero.id.toString(), libraryId: moviesLibraryId.toString(), type: 'movie', title: 'No Game No Life: Zero', year: 2017 },
        item: {
          id: noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!.toString(),
          mediaId: noGameNoLifeZero.id.toString(),
          kind: 'movie',
          title: 'No Game No Life: Zero',
          synopsis: null,
          durationSeconds: DURATION,
          me: { watchProgress: { positionSeconds: 754, updatedAt: '2026-11-01T20:15:00.000Z' } },
        },
      }],
    });
  });

  test('Lists the most recently watched media first', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    const youjoSenkiMovie = await createMovie(moviesLibraryId, 'Youjo Senki Movie');
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');
    await recordProgress(alice.id, youjoSenkiMovie.itemIds['Youjo Senki Movie.mkv']!, 300, '2026-11-03T21:00:00.000Z');

    const page = await list();

    expect(page.items.map((entry) => entry.media.title)).toEqual(['Youjo Senki Movie', 'No Game No Life: Zero']);
  });

  test('Continues a show with the episode after the finished one, which has no progress yet', async () => {
    const codeGeass = await createCodeGeass();
    await recordProgress(alice.id, codeGeass.itemIds['S01E01.mkv']!, DURATION - 60, '2026-11-01T20:15:00.000Z');

    const page = await list();

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      media: { type: 'show', title: 'Code Geass: Hangyaku no Lelouch' },
      item: { id: codeGeass.itemIds['S01E02.mkv']!.toString(), kind: 'episode', title: 'The White Knight Awakens', me: { watchProgress: null } },
    });
  });

  test('Lists a show once, by its most recently watched episode', async () => {
    const codeGeass = await createCodeGeass();
    await recordProgress(alice.id, codeGeass.itemIds['S01E02.mkv']!, 300, '2026-11-02T20:15:00.000Z');
    await recordProgress(alice.id, codeGeass.itemIds['S01E01.mkv']!, 600, '2026-11-03T20:15:00.000Z');

    const page = await list();

    expect(page.items.map((entry) => entry.item.title)).toEqual(['The Day a New Demon Was Born']);
  });

  test('Leaves out media whose last item is finished', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    const codeGeass = await createCodeGeass();
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, DURATION, '2026-11-01T20:15:00.000Z');
    await recordProgress(alice.id, codeGeass.itemIds['S01E02.mkv']!, DURATION, '2026-11-02T20:15:00.000Z');

    await expect(list()).resolves.toStrictEqual({ items: [] });
  });

  test('Leaves out media whose watched item is missing', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');
    await markMissing(noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!);

    await expect(list()).resolves.toStrictEqual({ items: [] });
  });

  test('Does not continue a show with a missing episode', async () => {
    const codeGeass = await createCodeGeass();
    await recordProgress(alice.id, codeGeass.itemIds['S01E01.mkv']!, DURATION, '2026-11-01T20:15:00.000Z');
    await markMissing(codeGeass.itemIds['S01E02.mkv']!);

    await expect(list()).resolves.toStrictEqual({ items: [] });
  });

  test('Leaves out the progress of other users and media the user cannot access', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    const vacation = await createMovie(carolsLibraryId, 'Vacation');
    await recordProgress(carolId, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');
    await recordProgress(alice.id, vacation.itemIds['Vacation.mkv']!, 754, '2026-11-01T20:15:00.000Z');

    await expect(list()).resolves.toStrictEqual({ items: [] });
  });

  test('Lists media of a library shared with the user', async () => {
    const vacation = await createMovie(carolsLibraryId, 'Vacation');
    await databaseClient.mediaLibrarySharedWith.create({ data: { libraryId: carolsLibraryId, userId: alice.id } });
    await recordProgress(alice.id, vacation.itemIds['Vacation.mkv']!, 754, '2026-11-01T20:15:00.000Z');

    const page = await list();

    expect(page.items.map((entry) => entry.media.title)).toEqual(['Vacation']);
  });

  test('Narrows the list to the requested libraries', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    const codeGeass = await createCodeGeass();
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');
    await recordProgress(alice.id, codeGeass.itemIds['S01E01.mkv']!, 600, '2026-11-02T20:15:00.000Z');

    const page = await list(20, [moviesLibraryId]);

    expect(page.items.map((entry) => entry.media.title)).toEqual(['No Game No Life: Zero']);
  });

  test('Returns at most the requested number of entries, counting only media that are not finished', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    const youjoSenkiMovie = await createMovie(moviesLibraryId, 'Youjo Senki Movie');
    const psychoPassMovie = await createMovie(moviesLibraryId, 'Psycho-Pass Movie 1');
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');
    await recordProgress(alice.id, youjoSenkiMovie.itemIds['Youjo Senki Movie.mkv']!, DURATION, '2026-11-02T20:15:00.000Z');
    await recordProgress(alice.id, psychoPassMovie.itemIds['Psycho-Pass Movie 1.mkv']!, 300, '2026-11-03T20:15:00.000Z');

    const page = await list(2);

    expect(page.items.map((entry) => entry.media.title)).toEqual(['Psycho-Pass Movie 1', 'No Game No Life: Zero']);
  });

  test('Leaves out media watched only before the user\'s 100 most recent progress rows', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    const episodes = Array.from({ length: 100 }, (_, index) => ({ file: `S01E${index + 1}.mkv`, title: `Episode ${index + 1}`, seasonNumber: 1, episodeNumber: index + 1 }));
    const detectiveConan = await createMedia(animeLibraryId, 'Detective Conan', episodes);
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');
    await databaseClient.mediaLibraryUserWatchProgress.createMany({
      data: Object.values(detectiveConan.itemIds).map((itemId) => ({ userId: alice.id, mediaItemId: itemId, durationInSec: 300, updatedAt: new Date('2026-11-02T20:15:00.000Z') })),
    });

    const page = await list();

    expect(page.items.map((entry) => entry.media.title)).toEqual(['Detective Conan']);
  });

  test('Leaves out an entry whose item a rescan deleted while the list was being built', async () => {
    const noGameNoLifeZero = await createMovie(moviesLibraryId, 'No Game No Life: Zero');
    await recordProgress(alice.id, noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']!, 754, '2026-11-01T20:15:00.000Z');
    const resolveNextForMedia = continueWatchingProvider.resolveNextForMedia.bind(continueWatchingProvider);
    vi.spyOn(continueWatchingProvider, 'resolveNextForMedia').mockImplementation(async (user, mediaId) => {
      const next = await resolveNextForMedia(user, mediaId);
      await databaseClient.mediaLibraryMediaItem.delete({ where: { id: noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv']! } });
      return next;
    });

    await expect(list()).resolves.toStrictEqual({ items: [] });
  });
});
