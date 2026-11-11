import { BadRequestError } from '@sprax/node-framework';
import DatabaseClient from '#src/database/DatabaseClient.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { MediaListQuery, type MediaListParams } from '#src/webserver/routes/api/media/v1/media/MediaListQuery.js';

const LISTING = 'media_listMedia';
const RECENTLY_ADDED: MediaListParams = { libraryIds: [], sort: 'addedAt', order: 'desc' };
const BY_TITLE: MediaListParams = { libraryIds: [], sort: 'title', order: 'asc' };

describe(MediaListQuery, () => {
  let databaseClient: DatabaseClient;
  let query: MediaListQuery;
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
    query = new MediaListQuery(databaseClient);
    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    carolId = (await databaseClient.authUser.create({ data: { displayName: 'Carol' } })).id;
    animeLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Anime', directoryUris: [] } })).id;
    moviesLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Movies', directoryUris: [] } })).id;
    carolsLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: carolId, name: 'Private', directoryUris: [] } })).id;

    await createMedia(animeLibraryId, 'No Game No Life', 2014, ['S01E01.mkv', 'S01E02.mkv'], { seasonNumber: 1 });
    await createMedia(animeLibraryId, 'No Game No Life: Zero', 2017, ['No Game No Life: Zero.mkv']);
    await createMedia(moviesLibraryId, 'Ghost in the Shell', 1995, ['Ghost in the Shell.mkv']);
    await createMedia(moviesLibraryId, 'Youjo Senki Movie', 2019, ['Youjo Senki Movie.mkv']);
    await createMedia(carolsLibraryId, 'Home Videos', 2020, ['Vacation.mkv']);
  });

  afterEach(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, carolId] } } });
  });

  async function createMedia(libraryId: bigint, title: string, year: number, files: string[], numbering?: { seasonNumber: number }): Promise<bigint> {
    const media = await databaseClient.mediaLibraryMedia.create({
      data: {
        libraryId,
        title,
        year,
        directoryUri: `apollo-file:///${encodeURIComponent(`${title} (${year})`)}`,
        items: {
          create: files.map((file, index) => ({
            relativeFilePath: file,
            durationInSec: 1440,
            title: file,
            seasonNumber: numbering?.seasonNumber ?? null,
            episodeNumber: numbering != null ? index + 1 : null,
          })),
        },
      },
    });
    return media.id;
  }

  async function markAllItemsMissing(mediaTitle: string): Promise<void> {
    await databaseClient.mediaLibraryMediaItem.updateMany({ where: { media: { title: mediaTitle } }, data: { missingSince: new Date('2026-11-05T03:00:00.000Z') } });
  }

  test('Lists the newest media of every accessible library first, leaving out other users\' libraries', async () => {
    const page = await query.run(alice, { listing: LISTING, limit: 10 }, RECENTLY_ADDED);

    expect(page.items.map((item) => item.title)).toEqual(['Youjo Senki Movie', 'Ghost in the Shell', 'No Game No Life: Zero', 'No Game No Life']);
  });

  test('Leaves out media whose files are all missing', async () => {
    await markAllItemsMissing('Ghost in the Shell');

    const page = await query.run(alice, { listing: LISTING, limit: 10 }, { ...RECENTLY_ADDED, libraryIds: [moviesLibraryId] });

    expect(page.items.map((item) => item.title)).toEqual(['Youjo Senki Movie']);
  });

  test('Summarises each media with its library and a type derived from having episodes', async () => {
    const page = await query.run(alice, { listing: LISTING, limit: 10 }, { ...RECENTLY_ADDED, libraryIds: [animeLibraryId] });

    expect(page.items).toEqual([
      { id: expect.any(String), libraryId: animeLibraryId.toString(), type: 'movie', title: 'No Game No Life: Zero', year: 2017 },
      { id: expect.any(String), libraryId: animeLibraryId.toString(), type: 'show', title: 'No Game No Life', year: 2014 },
    ]);
  });

  test('Ignores a requested library the user cannot access', async () => {
    const page = await query.run(alice, { listing: LISTING, limit: 10 }, { ...RECENTLY_ADDED, libraryIds: [moviesLibraryId, carolsLibraryId] });

    expect(page.items.map((item) => item.title)).toEqual(['Youjo Senki Movie', 'Ghost in the Shell']);
  });

  test('Continues a recently-added listing on the next page where the previous one ended', async () => {
    const firstPage = await query.run(alice, { listing: LISTING, limit: 2 }, RECENTLY_ADDED);

    const secondPage = await query.run(alice, { listing: LISTING, limit: 2, cursor: firstPage.nextCursor! }, RECENTLY_ADDED);

    expect(secondPage.items.map((item) => item.title)).toEqual(['No Game No Life: Zero', 'No Game No Life']);
    expect(secondPage.nextCursor).toBeNull();
  });

  test('Keeps the second page of a recently-added listing in place when media are added in between', async () => {
    const firstPage = await query.run(alice, { listing: LISTING, limit: 2 }, RECENTLY_ADDED);
    await createMedia(animeLibraryId, 'Perfect Blue', 1997, ['Perfect Blue.mkv']);

    const secondPage = await query.run(alice, { listing: LISTING, limit: 2, cursor: firstPage.nextCursor! }, RECENTLY_ADDED);

    expect(secondPage.items.map((item) => item.title)).toEqual(['No Game No Life: Zero', 'No Game No Life']);
  });

  test('Keeps the second page of an alphabetical listing in place when a media sorting before the cursor is added in between', async () => {
    const firstPage = await query.run(alice, { listing: LISTING, limit: 2 }, BY_TITLE);
    await createMedia(moviesLibraryId, 'Akira', 1988, ['Akira.mkv']);

    const secondPage = await query.run(alice, { listing: LISTING, limit: 2, cursor: firstPage.nextCursor! }, BY_TITLE);

    expect(secondPage.items.map((item) => item.title)).toEqual(['No Game No Life: Zero', 'Youjo Senki Movie']);
  });

  test('Lists the oldest media first when asked for ascending order', async () => {
    const page = await query.run(alice, { listing: LISTING, limit: 10 }, { ...RECENTLY_ADDED, order: 'asc' });

    expect(page.items.map((item) => item.title)).toEqual(['No Game No Life', 'No Game No Life: Zero', 'Ghost in the Shell', 'Youjo Senki Movie']);
  });

  test('Lists media alphabetically and continues after the last title and id', async () => {
    const firstPage = await query.run(alice, { listing: LISTING, limit: 2 }, BY_TITLE);

    const secondPage = await query.run(alice, { listing: LISTING, limit: 2, cursor: firstPage.nextCursor! }, BY_TITLE);

    expect(firstPage.items.map((item) => item.title)).toEqual(['Ghost in the Shell', 'No Game No Life']);
    expect(secondPage.items.map((item) => item.title)).toEqual(['No Game No Life: Zero', 'Youjo Senki Movie']);
  });

  test('Orders media with the same title by id so neither is skipped across pages', async () => {
    const liveActionId = await createMedia(moviesLibraryId, 'Ghost in the Shell', 2017, ['Ghost in the Shell (2017).mkv']);
    const firstPage = await query.run(alice, { listing: LISTING, limit: 1 }, BY_TITLE);

    const secondPage = await query.run(alice, { listing: LISTING, limit: 1, cursor: firstPage.nextCursor! }, BY_TITLE);

    expect(firstPage.items[0]!.title).toBe('Ghost in the Shell');
    expect(secondPage.items[0]).toEqual(expect.objectContaining({ title: 'Ghost in the Shell', id: liveActionId.toString() }));
  });

  test('Rejects a cursor taken from a listing with another library filter', async () => {
    const page = await query.run(alice, { listing: LISTING, limit: 1 }, { ...RECENTLY_ADDED, libraryIds: [animeLibraryId] });

    await expect(query.run(alice, { listing: LISTING, limit: 1, cursor: page.nextCursor! }, RECENTLY_ADDED)).rejects.toThrow(BadRequestError);
  });
});
