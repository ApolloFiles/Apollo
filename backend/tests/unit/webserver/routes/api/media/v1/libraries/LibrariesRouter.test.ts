import type { DeepMockProxy } from 'vitest-mock-extended';
import { LibrariesRouter } from '#src/webserver/routes/api/media/v1/libraries/LibrariesRouter.js';
import type { LibraryListQuery } from '#src/webserver/routes/api/media/v1/libraries/LibraryListQuery.js';
import type ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import { createTestWebServer, getWithAccessToken, TEST_USER } from '#tests/unit/webserver/createTestWebServer.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const PAGE = {
  nextCursor: 'eyJ2IjoxfQ',
  items: [
    { id: '7301000000000000001', name: 'Anime', me: { role: 'owner' as const, preferences: { hiddenFromOverview: false, hiddenFromSidebar: true } } },
  ],
};

describe(LibrariesRouter, () => {
  let libraryListQuery: DeepMockProxy<LibraryListQuery>;
  let server: ApolloWebServer;

  beforeEach(() => {
    libraryListQuery = createStrictDeepMock<LibraryListQuery>();
    libraryListQuery.run.mockResolvedValue(PAGE);

    server = createTestWebServer([new LibrariesRouter(libraryListQuery)]);
  });

  afterEach(async () => {
    await server.shutdown();
  });

  test('Responds with the page the query produced', async () => {
    const { statusCode, body } = await getWithAccessToken(server, '/?limit=10');

    expect(statusCode).toBe(200);
    expect(body).toEqual(PAGE);
  });

  test('Runs the query as the authenticated user with the page request named after the operation', async () => {
    await getWithAccessToken(server, '/?limit=10&cursor=abc');

    expect(libraryListQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, { listing: 'media_listLibraries', limit: 10, cursor: 'abc' });
  });

  test('Uses a page size of 50 when none is given', async () => {
    await getWithAccessToken(server, '/');

    expect(libraryListQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, { listing: 'media_listLibraries', limit: 50, cursor: undefined });
  });

  test('Rejects a page size above the maximum with a 400 that names the failed parameter', async () => {
    const { statusCode, body } = await getWithAccessToken(server, '/?limit=101');

    expect(statusCode).toBe(400);
    expect(body).toEqual({
      error: 'Request validation failed',
      context: 'querystring',
      issues: [{ path: '/limit', message: expect.stringContaining('100') }],
    });
  });

  test('Rejects a request without credentials with a 401', async () => {
    const response = await server.inject('/');

    expect(response.statusCode).toBe(401);
  });
});
