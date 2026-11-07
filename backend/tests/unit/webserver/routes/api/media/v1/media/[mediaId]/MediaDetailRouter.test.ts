import { NotFoundError } from '@sprax/node-framework';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type { MediaDetailQuery } from '#src/webserver/routes/api/media/v1/media/[mediaId]/MediaDetailQuery.js';
import { MediaDetailRouter } from '#src/webserver/routes/api/media/v1/media/[mediaId]/MediaDetailRouter.js';
import { OpenApiRouter } from '#src/webserver/routes/api/OpenApiRouter.js';
import type ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import { createTestWebServer, getWithAccessToken, TEST_USER } from '#tests/unit/webserver/createTestWebServer.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const EPISODE = {
  id: '7303000000000000001',
  mediaId: '7302000000000000003',
  kind: 'episode' as const,
  title: 'Asteroid Blues',
  synopsis: null,
  seasonNumber: 1,
  episodeNumber: 1,
  durationSeconds: 1440,
  me: { watchProgress: { positionSeconds: 600, updatedAt: '2026-11-07T10:00:00.000Z' } },
};

const DETAIL = {
  id: '7302000000000000003',
  libraryId: '7301000000000000001',
  type: 'show' as const,
  title: 'Cowboy Bebop',
  year: 1998,
  synopsis: 'Bounty hunters in space.',
  externalIds: { tmdb: '30991' },
  me: { nextItemToWatch: EPISODE },
  items: [],
  seasons: [{ seasonNumber: 1, items: [EPISODE] }],
};

describe(MediaDetailRouter, () => {
  let mediaDetailQuery: DeepMockProxy<MediaDetailQuery>;
  let server: ApolloWebServer;

  beforeEach(() => {
    mediaDetailQuery = createStrictDeepMock<MediaDetailQuery>();
    mediaDetailQuery.run.mockResolvedValue(DETAIL);

    server = createTestWebServer([{ router: new MediaDetailRouter(mediaDetailQuery), prefix: '/media/:mediaId' }, new OpenApiRouter()]);
  });

  afterEach(async () => {
    await server.shutdown();
  });

  test('Responds with the detail the query produced for the authenticated user', async () => {
    const { statusCode, body } = await getWithAccessToken(server, '/media/7302000000000000003');

    expect(statusCode).toBe(200);
    expect(body).toEqual(DETAIL);
    expect(mediaDetailQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, 7302000000000000003n);
  });

  test('Passes the 404 of the query through with its message', async () => {
    mediaDetailQuery.run.mockRejectedValue(new NotFoundError('Media \'7302000000000000009\' does not exist or you do not have access to it'));

    const { statusCode, body } = await getWithAccessToken(server, '/media/7302000000000000009');

    expect(statusCode).toBe(404);
    expect(body).toEqual({ error: 'Media \'7302000000000000009\' does not exist or you do not have access to it' });
  });

  test('Rejects a media id that is not numeric with a 400', async () => {
    const { statusCode } = await getWithAccessToken(server, '/media/cowboy-bebop');

    expect(statusCode).toBe(400);
  });

  test('Rejects a request without credentials with a 401', async () => {
    const response = await server.inject('/media/7302000000000000003');

    expect(response.statusCode).toBe(401);
  });

  test('Documents the detail as a named schema that embeds the item schema', async () => {
    const response = await server.inject('/openapi.json');

    const document = response.json();
    expect(document.paths['/media/{mediaId}'].get.responses['200'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/MediaDetail' });
    expect(document.components.schemas.MediaDetail.properties.me.properties.nextItemToWatch.anyOf).toContainEqual({ $ref: '#/components/schemas/BaseItem' });
  });
});
