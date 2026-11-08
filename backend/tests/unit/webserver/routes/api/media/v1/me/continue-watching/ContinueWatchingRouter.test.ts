import type { DeepMockProxy } from 'vitest-mock-extended';
import type { ContinueWatchingQuery } from '#src/webserver/routes/api/media/v1/me/continue-watching/ContinueWatchingQuery.js';
import { ContinueWatchingRouter } from '#src/webserver/routes/api/media/v1/me/continue-watching/ContinueWatchingRouter.js';
import { OpenApiRouter } from '#src/webserver/routes/api/OpenApiRouter.js';
import type ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import { createTestWebServer, getWithAccessToken, TEST_USER } from '#tests/unit/webserver/createTestWebServer.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const LIST = {
  items: [{
    media: { id: '7302000000000000003', libraryId: '7301000000000000001', type: 'show' as const, title: 'Code Geass: Hangyaku no Lelouch', year: 2006 },
    item: {
      id: '7303000000000000002',
      mediaId: '7302000000000000003',
      kind: 'episode' as const,
      title: 'The White Knight Awakens',
      synopsis: null,
      seasonNumber: 1,
      episodeNumber: 2,
      durationSeconds: 1440,
      me: { watchProgress: null },
    },
  }],
};

describe(ContinueWatchingRouter, () => {
  let continueWatchingQuery: DeepMockProxy<ContinueWatchingQuery>;
  let server: ApolloWebServer;

  beforeEach(() => {
    continueWatchingQuery = createStrictDeepMock<ContinueWatchingQuery>();
    continueWatchingQuery.run.mockResolvedValue(LIST);

    server = createTestWebServer([{ router: new ContinueWatchingRouter(continueWatchingQuery), prefix: '/me/continue-watching' }, new OpenApiRouter()]);
  });

  afterEach(async () => {
    await server.shutdown();
  });

  test('Responds with the list the query produced', async () => {
    const { statusCode, body } = await getWithAccessToken(server, '/me/continue-watching');

    expect(statusCode).toBe(200);
    expect(body).toEqual(LIST);
  });

  test('Lists 20 entries of every accessible library by default', async () => {
    await getWithAccessToken(server, '/me/continue-watching');

    expect(continueWatchingQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, { libraryIds: [], limit: 20 });
  });

  test('Accepts the library filter once or repeated', async () => {
    await getWithAccessToken(server, '/me/continue-watching?libraryId=7301000000000000001&libraryId=7301000000000000002');

    expect(continueWatchingQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, { libraryIds: [7301000000000000001n, 7301000000000000002n], limit: 20 });
  });

  test('Rejects a limit above 50 with a 400 naming the parameter', async () => {
    const { statusCode, body } = await getWithAccessToken(server, '/me/continue-watching?limit=51');

    expect(statusCode).toBe(400);
    expect(body).toMatchObject({ context: 'querystring', issues: [{ path: '/limit' }] });
  });

  test('Rejects a request without credentials with a 401', async () => {
    const response = await server.inject('/me/continue-watching');

    expect(response.statusCode).toBe(401);
  });

  test('Documents the list and its entries as named schemas, without pagination parameters', async () => {
    const response = await server.inject('/openapi.json');

    const document = response.json();
    const operation = document.paths['/me/continue-watching'].get;
    expect(operation.responses['200'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/ContinueWatchingList' });
    expect(document.components.schemas.ContinueWatchingList.properties.items.items).toEqual({ $ref: '#/components/schemas/ContinueWatchingEntry' });
    expect(operation.parameters.map((parameter: { name: string }) => parameter.name)).not.toContain('cursor');
  });
});
