import type { DeepMockProxy } from 'vitest-mock-extended';
import type { MediaListQuery } from '#src/webserver/routes/api/media/v1/media/MediaListQuery.js';
import { MediaRouter } from '#src/webserver/routes/api/media/v1/media/MediaRouter.js';
import { OpenApiRouter } from '#src/webserver/routes/api/OpenApiRouter.js';
import type ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import { createTestWebServer, getWithAccessToken, TEST_USER } from '#tests/unit/webserver/createTestWebServer.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const PAGE = {
  nextCursor: null,
  items: [
    { id: '7302000000000000003', libraryId: '7301000000000000001', type: 'show' as const, title: 'Code Geass: Hangyaku no Lelouch', year: 2006 },
  ],
};

describe(MediaRouter, () => {
  let mediaListQuery: DeepMockProxy<MediaListQuery>;
  let server: ApolloWebServer;

  beforeEach(() => {
    mediaListQuery = createStrictDeepMock<MediaListQuery>();
    mediaListQuery.run.mockResolvedValue(PAGE);

    server = createTestWebServer([new MediaRouter(mediaListQuery), new OpenApiRouter()]);
  });

  afterEach(async () => {
    await server.shutdown();
  });

  test('Responds with the page the query produced', async () => {
    const { statusCode, body } = await getWithAccessToken(server, '/?limit=10');

    expect(statusCode).toBe(200);
    expect(body).toEqual(PAGE);
  });

  test('Lists the most recently added media of every accessible library first by default', async () => {
    await getWithAccessToken(server, '/?limit=10');

    expect(mediaListQuery.run).toHaveBeenCalledExactlyOnceWith(
      TEST_USER,
      { listing: 'media_listMedia', limit: 10, cursor: undefined },
      { libraryIds: [], sort: 'addedAt', order: 'desc' },
    );
  });

  test('Sorts by title ascending by default when asked for titles', async () => {
    await getWithAccessToken(server, '/?sort=title');

    expect(mediaListQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, expect.anything(), { libraryIds: [], sort: 'title', order: 'asc' });
  });

  test('Passes an explicit order through', async () => {
    await getWithAccessToken(server, '/?sort=title&order=desc');

    expect(mediaListQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, expect.anything(), { libraryIds: [], sort: 'title', order: 'desc' });
  });

  test('Accepts the library filter once or repeated', async () => {
    await getWithAccessToken(server, '/?libraryId=7301000000000000001&libraryId=7301000000000000002');

    expect(mediaListQuery.run).toHaveBeenCalledExactlyOnceWith(
      TEST_USER,
      expect.anything(),
      { libraryIds: [7301000000000000001n, 7301000000000000002n], sort: 'addedAt', order: 'desc' },
    );
  });

  test('Rejects a library id that is not numeric with a 400', async () => {
    const { statusCode } = await getWithAccessToken(server, '/?libraryId=anime');

    expect(statusCode).toBe(400);
  });

  test('Rejects a request without credentials with a 401', async () => {
    const response = await server.inject('/');

    expect(response.statusCode).toBe(401);
  });

  test('Documents the library filter as a parameter that accepts one or several ids', async () => {
    const response = await server.inject('/openapi.json');

    const parameters = response.json().paths['/'].get.parameters;
    expect(parameters.find((parameter: { name: string }) => parameter.name === 'libraryId').schema.anyOf).toHaveLength(2);
  });

  test('Documents ids as plain strings, not as a numeric pattern', async () => {
    const response = await server.inject('/openapi.json');

    const libraryIdSchema = response.json().paths['/'].get.parameters.find((parameter: { name: string }) => parameter.name === 'libraryId').schema;
    expect(JSON.stringify(libraryIdSchema)).not.toContain('pattern');
  });
});
