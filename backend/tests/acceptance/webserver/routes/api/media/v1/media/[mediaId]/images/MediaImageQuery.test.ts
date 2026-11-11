import { BadRequestError, NotFoundError } from '@sprax/node-framework';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type { CachedValue } from '#src/cache/CacheEntry.js';
import DatabaseClient from '#src/database/DatabaseClient.js';
import FullLibraryMedia from '#src/plugins/official/media/library/database/media/FullLibraryMedia.js';
import ImageFormatNotSupportedError from '#src/plugins/official/media/library/images/error/ImageFormatNotSupportedError.js';
import type MediaBackdropImageProvider from '#src/plugins/official/media/library/images/MediaBackdropImageProvider.js';
import type MediaClearLogoImageProvider from '#src/plugins/official/media/library/images/MediaClearLogoImageProvider.js';
import type MediaPosterImageProvider from '#src/plugins/official/media/library/images/MediaPosterImageProvider.js';
import ApolloFileURI from '#src/uri/ApolloFileURI.js';
import ApolloUser from '#src/user/ApolloUser.js';
import { MediaImageQuery } from '#src/webserver/routes/api/media/v1/media/[mediaId]/images/MediaImageQuery.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

describe(MediaImageQuery, () => {
  let databaseClient: DatabaseClient;
  let posterImageProvider: DeepMockProxy<MediaPosterImageProvider>;
  let backdropImageProvider: DeepMockProxy<MediaBackdropImageProvider>;
  let clearLogoImageProvider: DeepMockProxy<MediaClearLogoImageProvider>;
  let image: CachedValue<Buffer>;
  let query: MediaImageQuery;
  let alice: ApolloUser;
  let carolId: string;
  let noGameNoLifeZeroId: bigint;
  let homeVideosId: bigint;
  let carolsLibraryId: bigint;

  beforeAll(() => {
    databaseClient = new DatabaseClient();
  });

  afterAll(async () => {
    await databaseClient.$disconnect();
  });

  beforeEach(async () => {
    image = createStrictDeepMock<CachedValue<Buffer>>();
    posterImageProvider = createStrictDeepMock<MediaPosterImageProvider>();
    backdropImageProvider = createStrictDeepMock<MediaBackdropImageProvider>();
    clearLogoImageProvider = createStrictDeepMock<MediaClearLogoImageProvider>();
    query = new MediaImageQuery(databaseClient, posterImageProvider, backdropImageProvider, clearLogoImageProvider);

    alice = new ApolloUser((await databaseClient.authUser.create({ data: { displayName: 'Alice' } })).id, 'Alice', false, false, null);
    carolId = (await databaseClient.authUser.create({ data: { displayName: 'Carol' } })).id;
    const animeLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: alice.id, name: 'Anime', directoryUris: [] } })).id;
    carolsLibraryId = (await databaseClient.mediaLibrary.create({ data: { ownerId: carolId, name: 'Private', directoryUris: [] } })).id;
    noGameNoLifeZeroId = await createMedia(animeLibraryId, 'No Game No Life: Zero');
    homeVideosId = await createMedia(carolsLibraryId, 'Home Videos');
  });

  afterEach(async () => {
    await databaseClient.authUser.deleteMany({ where: { id: { in: [alice.id, carolId] } } });
  });

  async function createMedia(libraryId: bigint, title: string): Promise<bigint> {
    const media = await databaseClient.mediaLibraryMedia.create({
      data: {
        libraryId,
        title,
        year: 2017,
        directoryUri: ApolloFileURI.create(alice.id, 'local', `/${title}`).toString(),
        items: { create: [{ relativeFilePath: `${title}.mkv`, durationInSec: 6420, title }] },
      },
    });
    return media.id;
  }

  test.for([
    { kind: 'poster', provider: () => posterImageProvider },
    { kind: 'backdrop', provider: () => backdropImageProvider },
    { kind: 'logo', provider: () => clearLogoImageProvider },
  ] as const)('Serves the $kind of an own media through its provider in the requested format', async ({ kind, provider }) => {
    provider().provide.mockResolvedValue(image);

    await expect(query.run(alice, noGameNoLifeZeroId, kind, 'avif')).resolves.toBe(image);

    expect(provider().provide).toHaveBeenCalledExactlyOnceWith(expect.any(FullLibraryMedia), 'avif');
    expect(provider().provide.mock.calls[0]![0]).toMatchObject({ id: noGameNoLifeZeroId, title: 'No Game No Life: Zero', libraryOwnerId: alice.id });
  });

  test('Serves the image of a media in a library shared with the user', async () => {
    await databaseClient.mediaLibrarySharedWith.create({ data: { libraryId: carolsLibraryId, userId: alice.id } });
    posterImageProvider.provide.mockResolvedValue(image);

    await expect(query.run(alice, homeVideosId, 'poster', 'jpeg')).resolves.toBe(image);
  });

  test('Reports a media of another user\'s library as not found without asking a provider', async () => {
    await expect(query.run(alice, homeVideosId, 'poster', 'jpeg'))
      .rejects.toThrow(new NotFoundError(`Media '${homeVideosId}' does not exist or you do not have access to it`));

    expect(posterImageProvider.provide).not.toHaveBeenCalled();
  });

  test('Reports a media whose files are all missing as not found without asking a provider', async () => {
    await databaseClient.mediaLibraryMediaItem.updateMany({ where: { mediaId: noGameNoLifeZeroId }, data: { missingSince: new Date('2026-11-05T03:00:00.000Z') } });

    await expect(query.run(alice, noGameNoLifeZeroId, 'poster', 'jpeg'))
      .rejects.toThrow(new NotFoundError(`Media '${noGameNoLifeZeroId}' does not exist or you do not have access to it`));
    expect(posterImageProvider.provide).not.toHaveBeenCalled();
  });

  test('Reports a media without the requested image as not found', async () => {
    backdropImageProvider.provide.mockResolvedValue(null);

    await expect(query.run(alice, noGameNoLifeZeroId, 'backdrop', 'jpeg')).rejects.toThrow(new NotFoundError(`Media '${noGameNoLifeZeroId}' has no backdrop`));
  });

  test('Rejects a format the provider cannot deliver for the kind as a bad request', async () => {
    posterImageProvider.provide.mockRejectedValue(new ImageFormatNotSupportedError('png is not supported for poster'));

    await expect(query.run(alice, noGameNoLifeZeroId, 'poster', 'png')).rejects.toThrow(new BadRequestError('Format \'png\' is not available for \'poster\''));
  });
});
