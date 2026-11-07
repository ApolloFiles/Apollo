import { BadRequestError } from '@sprax/node-framework';
import DatabaseClient from '#src/database/DatabaseClient.js';
import MediaLibraryUserPreferences
  from '#src/plugins/official/media/library/database/user-preferences/MediaLibraryUserPreferences.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { LibraryListQuery } from '#src/webserver/routes/api/media/v1/libraries/LibraryListQuery.js';

const LISTING = 'media_listLibraries';

describe(LibraryListQuery, () => {
  let databaseClient: DatabaseClient;
  let query: LibraryListQuery;
  let alice: ApolloUser;
  let bobId: string;
  let carolId: string;
  let kidsId: bigint;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    query = new LibraryListQuery(databaseClient);
    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    bobId = (await databaseClient.authUser.create({ data: { displayName: 'Bob' } })).id;
    carolId = (await databaseClient.authUser.create({ data: { displayName: 'Carol' } })).id;

    await createLibrary(alice.id, 'Shows');
    await createLibrary(alice.id, 'Anime');
    await createLibrary(alice.id, 'Movies');
    kidsId = await createLibrary(bobId, 'Kids', [alice.id]);
    await createLibrary(carolId, 'Private');

    await databaseClient.mediaLibraryUserPreferences.create({
      data: { userId: alice.id, libraryId: kidsId, ...MediaLibraryUserPreferences.getHideFromSidebarPreferenceData(true) },
    });
    await databaseClient.mediaLibraryUserPreferences.create({
      data: { userId: bobId, libraryId: kidsId, ...MediaLibraryUserPreferences.getHideFromOverviewPreferenceData(true) },
    });
  });

  afterEach(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, bobId, carolId] } } });
  });

  async function createLibrary(ownerId: string, name: string, sharedWithUserIds: string[] = []): Promise<bigint> {
    const library = await databaseClient.mediaLibrary.create({
      data: {
        ownerId,
        name,
        directoryUris: [],
        MediaLibrarySharedWith: { create: sharedWithUserIds.map((userId) => ({ userId })) },
      },
    });
    return library.id;
  }

  test('Lists owned and shared libraries by name, leaving out other users\' libraries', async () => {
    const page = await query.run(alice, { listing: LISTING, limit: 10 });

    expect(page.items.map((item) => item.name)).toEqual(['Anime', 'Kids', 'Movies', 'Shows']);
    expect(page.nextCursor).toBeNull();
  });

  test('Tells the requesting user\'s role and own preferences per library, not another user\'s', async () => {
    const page = await query.run(alice, { listing: LISTING, limit: 10 });

    expect(page.items.map((item) => [item.name, item.me.role, item.me.preferences])).toEqual([
      ['Anime', 'owner', { hiddenFromOverview: false, hiddenFromSidebar: false }],
      ['Kids', 'shared', { hiddenFromOverview: false, hiddenFromSidebar: true }],
      ['Movies', 'owner', { hiddenFromOverview: false, hiddenFromSidebar: false }],
      ['Shows', 'owner', { hiddenFromOverview: false, hiddenFromSidebar: false }],
    ]);
  });

  test('Continues on the next page where the previous one ended', async () => {
    const firstPage = await query.run(alice, { listing: LISTING, limit: 2 });

    const secondPage = await query.run(alice, { listing: LISTING, limit: 2, cursor: firstPage.nextCursor! });

    expect(firstPage.items.map((item) => item.name)).toEqual(['Anime', 'Kids']);
    expect(secondPage.items.map((item) => item.name)).toEqual(['Movies', 'Shows']);
    expect(secondPage.nextCursor).toBeNull();
  });

  test('Keeps the second page in place when a library sorting before the cursor appears in between', async () => {
    const firstPage = await query.run(alice, { listing: LISTING, limit: 2 });
    await createLibrary(alice.id, 'Duck Documentaries');

    const secondPage = await query.run(alice, { listing: LISTING, limit: 2, cursor: firstPage.nextCursor! });

    expect(secondPage.items.map((item) => item.name)).toEqual(['Movies', 'Shows']);
  });

  test('Orders libraries with the same name by id so neither is skipped across pages', async () => {
    const newerId = await createLibrary(alice.id, 'Movies');
    const firstThree = await query.run(alice, { listing: LISTING, limit: 3 });

    const rest = await query.run(alice, { listing: LISTING, limit: 3, cursor: firstThree.nextCursor! });

    expect(firstThree.items.map((item) => item.name)).toEqual(['Anime', 'Kids', 'Movies']);
    expect(rest.items.map((item) => item.name)).toEqual(['Movies', 'Shows']);
    expect(rest.items[0]!.id).toBe(newerId.toString());
  });

  test('Rejects a cursor from another listing', async () => {
    const page = await query.run(alice, { listing: 'media_listMedia', limit: 2 });

    await expect(query.run(alice, { listing: LISTING, limit: 2, cursor: page.nextCursor! })).rejects.toThrow(BadRequestError);
  });
});
