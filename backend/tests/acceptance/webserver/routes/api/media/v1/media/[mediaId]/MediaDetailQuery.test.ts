import { NotFoundError } from '@sprax/node-framework';
import DatabaseClient from '#src/database/DatabaseClient.js';
import ContinueWatchingProvider from '#src/plugins/official/media/library/ContinueWatchingProvider.js';
import MediaLibraryByUserFinder from '#src/plugins/official/media/library/database/library/MediaLibraryByUserFinder.js';
import MediaLibraryMediaItemFinder from '#src/plugins/official/media/library/database/media-item/MediaLibraryMediaItemFinder.js';
import MediaLibraryMediaFinder from '#src/plugins/official/media/library/database/media/MediaLibraryMediaFinder.js';
import WatchProgressFinder from '#src/plugins/official/media/library/database/watch-progress/WatchProgressFinder.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { MediaDetailQuery } from '#src/webserver/routes/api/media/v1/media/[mediaId]/MediaDetailQuery.js';

type ItemSpec = { file: string, title: string, seasonNumber?: number, episodeNumber?: number };

const EPISODE_DURATION = 1440;

describe(MediaDetailQuery, () => {
  let databaseClient: DatabaseClient;
  let query: MediaDetailQuery;
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
    const continueWatchingProvider = new ContinueWatchingProvider(
      new WatchProgressFinder(databaseClient),
      new MediaLibraryMediaItemFinder(databaseClient),
      new MediaLibraryByUserFinder(databaseClient),
      new MediaLibraryMediaFinder(databaseClient),
    );
    query = new MediaDetailQuery(databaseClient, continueWatchingProvider);

    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    carolId = (await databaseClient.authUser.create({ data: { displayName: 'Carol' } })).id;
    animeLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Anime', directoryUris: [] } })).id;
    carolsLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: carolId, name: 'Private', directoryUris: [] } })).id;
  });

  afterEach(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, carolId] } } });
  });

  async function createMedia(libraryId: bigint, title: string, items: ItemSpec[]): Promise<{ id: bigint, itemIds: Record<string, string> }> {
    const media = await databaseClient.mediaLibraryMedia.create({
      data: {
        libraryId,
        title,
        year: 2017,
        synopsis: 'Riku and Schwi in the age of the Great War.',
        directoryUri: `apollo-file:///${encodeURIComponent(title)}`,
        items: {
          create: items.map((item) => ({
            relativeFilePath: item.file,
            durationInSec: EPISODE_DURATION,
            title: item.title,
            seasonNumber: item.seasonNumber ?? null,
            episodeNumber: item.episodeNumber ?? null,
          })),
        },
      },
      select: { id: true, items: { select: { id: true, relativeFilePath: true } } },
    });
    return {
      id: media.id,
      itemIds: Object.fromEntries(media.items.map((item) => [item.relativeFilePath, item.id.toString()])),
    };
  }

  async function createCodeGeass(): Promise<{ id: bigint, itemIds: Record<string, string> }> {
    return createMedia(animeLibraryId, 'Code Geass: Hangyaku no Lelouch', [
      { file: 'S02E01.mkv', title: 'The Day a Demon Awakens', seasonNumber: 2, episodeNumber: 1 },
      { file: 'S01E02.mkv', title: 'The White Knight Awakens', seasonNumber: 1, episodeNumber: 2 },
      { file: 'S01E01.mkv', title: 'The Day a New Demon Was Born', seasonNumber: 1, episodeNumber: 1 },
      { file: 'Extras.mkv', title: 'Extras' },
    ]);
  }

  async function recordProgress(userId: string, itemId: string, positionSeconds: number): Promise<Date> {
    const progress = await databaseClient.mediaLibraryUserWatchProgress.create({
      data: { userId, mediaItemId: BigInt(itemId), durationInSec: positionSeconds },
    });
    return progress.updatedAt;
  }

  test('Describes a movie with its single unnumbered item, which is also the next item to watch', async () => {
    const noGameNoLifeZero = await createMedia(animeLibraryId, 'No Game No Life: Zero', [{ file: 'No Game No Life: Zero.mkv', title: 'No Game No Life: Zero' }]);

    const detail = await query.run(alice, noGameNoLifeZero.id);

    const movieItem = {
      id: noGameNoLifeZero.itemIds['No Game No Life: Zero.mkv'],
      mediaId: noGameNoLifeZero.id.toString(),
      kind: 'movie',
      title: 'No Game No Life: Zero',
      synopsis: null,
      durationSeconds: EPISODE_DURATION,
      me: { watchProgress: null },
    };
    expect(detail).toStrictEqual({
      id: noGameNoLifeZero.id.toString(),
      libraryId: animeLibraryId.toString(),
      type: 'movie',
      title: 'No Game No Life: Zero',
      year: 2017,
      synopsis: 'Riku and Schwi in the age of the Great War.',
      externalIds: {},
      me: { nextItemToWatch: movieItem },
      items: [movieItem],
    });
  });

  test('Groups the numbered items of a show into ascending seasons and lists the unnumbered ones separately', async () => {
    const codeGeass = await createCodeGeass();

    const detail = await query.run(alice, codeGeass.id);

    expect(detail.type).toBe('show');
    expect(detail.seasons).toEqual([
      {
        seasonNumber: 1,
        items: [
          expect.objectContaining({ id: codeGeass.itemIds['S01E01.mkv'], kind: 'episode', seasonNumber: 1, episodeNumber: 1 }),
          expect.objectContaining({ id: codeGeass.itemIds['S01E02.mkv'], kind: 'episode', seasonNumber: 1, episodeNumber: 2 }),
        ],
      },
      { seasonNumber: 2, items: [expect.objectContaining({ id: codeGeass.itemIds['S02E01.mkv'], seasonNumber: 2, episodeNumber: 1 })] },
    ]);
    expect(detail.items).toEqual([expect.objectContaining({ id: codeGeass.itemIds['Extras.mkv'], kind: 'episode', title: 'Extras' })]);
    expect(detail.items[0]).not.toHaveProperty('seasonNumber');
  });

  test('Reports only the requesting user\'s watch progress, with the time it was updated', async () => {
    const codeGeass = await createCodeGeass();
    const updatedAt = await recordProgress(alice.id, codeGeass.itemIds['S01E01.mkv']!, 600);
    await recordProgress(carolId, codeGeass.itemIds['S01E02.mkv']!, 900);

    const detail = await query.run(alice, codeGeass.id);

    const [firstEpisode, secondEpisode] = detail.seasons![0]!.items;
    expect(firstEpisode!.me.watchProgress).toEqual({ positionSeconds: 600, updatedAt: updatedAt.toISOString() });
    expect(secondEpisode!.me.watchProgress).toBeNull();
  });

  test('Points at the episode after the one the user finished last', async () => {
    const codeGeass = await createCodeGeass();
    await recordProgress(alice.id, codeGeass.itemIds['S01E01.mkv']!, EPISODE_DURATION);

    const detail = await query.run(alice, codeGeass.id);

    expect(detail.me.nextItemToWatch?.id).toBe(codeGeass.itemIds['S01E02.mkv']);
  });

  test('Points at the first unnumbered item in display order when nothing was watched yet', async () => {
    const bladeRunner = await createMedia(animeLibraryId, 'Blade Runner', [
      { file: 'Blade Runner - The Final Cut.mkv', title: 'The Final Cut' },
      { file: 'Blade Runner - Director\'s Cut.mkv', title: 'Director\'s Cut' },
    ]);

    const detail = await query.run(alice, bladeRunner.id);

    expect(detail.me.nextItemToWatch?.title).toBe('Director\'s Cut');
  });

  test('Maps the external ids to the short names of their sources', async () => {
    const bebop = await createMedia(animeLibraryId, 'Cowboy Bebop', [
      { file: 'S01E01.mkv', title: 'Asteroid Blues', seasonNumber: 1, episodeNumber: 1 },
    ]);
    await databaseClient.mediaLibraryMediaExternalIds.createMany({
      data: [
        { mediaId: bebop.id, source: 'THE_MOVIE_DB', externalId: '30991' },
        { mediaId: bebop.id, source: 'IMDB', externalId: 'tt0213338' },
      ],
    });

    const detail = await query.run(alice, bebop.id);

    expect(detail.externalIds).toStrictEqual({ tmdb: '30991', imdb: 'tt0213338' });
  });

  test('Describes a media of a library shared with the user', async () => {
    const homeVideos = await createMedia(carolsLibraryId, 'Home Videos', [{ file: 'Vacation.mkv', title: 'Vacation' }]);
    await databaseClient.mediaLibrarySharedWith.create({ data: { libraryId: carolsLibraryId, userId: alice.id } });

    await expect(query.run(alice, homeVideos.id)).resolves.toMatchObject({ title: 'Home Videos' });
  });

  test('Reports a media of another user\'s library as not found', async () => {
    const homeVideos = await createMedia(carolsLibraryId, 'Home Videos', [{ file: 'Vacation.mkv', title: 'Vacation' }]);

    await expect(query.run(alice, homeVideos.id)).rejects.toThrow(new NotFoundError(`Media '${homeVideos.id}' does not exist or you do not have access to it`));
  });

  test('Reports an unknown media as not found', async () => {
    await expect(query.run(alice, 7302000000000000009n)).rejects.toThrow(NotFoundError);
  });
});
