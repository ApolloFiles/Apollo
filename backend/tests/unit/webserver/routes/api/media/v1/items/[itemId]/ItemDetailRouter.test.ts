import { NotFoundError } from '@sprax/node-framework';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type { ItemDetailQuery } from '#src/webserver/routes/api/media/v1/items/[itemId]/ItemDetailQuery.js';
import { ItemDetailRouter } from '#src/webserver/routes/api/media/v1/items/[itemId]/ItemDetailRouter.js';
import { OpenApiRouter } from '#src/webserver/routes/api/OpenApiRouter.js';
import type ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import { createTestWebServer, getWithAccessToken, TEST_USER } from '#tests/unit/webserver/createTestWebServer.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const ITEM = {
  id: '7303000000000000001',
  mediaId: '7302000000000000003',
  kind: 'episode' as const,
  title: 'The Day a New Demon Was Born',
  synopsis: null,
  seasonNumber: 1,
  episodeNumber: 1,
  durationSeconds: 1440,
  me: { watchProgress: null },
  files: [{ id: '7303000000000000001', fileName: 'Code Geass - S01E01 - The Day a New Demon Was Born.mkv', durationSeconds: 1440 }],
};

describe(ItemDetailRouter, () => {
  let itemDetailQuery: DeepMockProxy<ItemDetailQuery>;
  let server: ApolloWebServer;

  beforeEach(() => {
    itemDetailQuery = createStrictDeepMock<ItemDetailQuery>();
    itemDetailQuery.run.mockResolvedValue(ITEM);

    server = createTestWebServer([{ router: new ItemDetailRouter(itemDetailQuery), prefix: '/items/:itemId' }, new OpenApiRouter()]);
  });

  afterEach(async () => {
    await server.shutdown();
  });

  test('Responds with the item the query produced for the authenticated user', async () => {
    const { statusCode, body } = await getWithAccessToken(server, '/items/7303000000000000001');

    expect(statusCode).toBe(200);
    expect(body).toEqual(ITEM);
    expect(itemDetailQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, 7303000000000000001n);
  });

  test('Passes the 404 of the query through with its message', async () => {
    itemDetailQuery.run.mockRejectedValue(new NotFoundError('Item \'7303000000000000009\' does not exist or you do not have access to it'));

    const { statusCode, body } = await getWithAccessToken(server, '/items/7303000000000000009');

    expect(statusCode).toBe(404);
    expect(body).toEqual({ error: 'Item \'7303000000000000009\' does not exist or you do not have access to it' });
  });

  test('Rejects an item id that is not numeric with a 400', async () => {
    const { statusCode } = await getWithAccessToken(server, '/items/asteroid-blues');

    expect(statusCode).toBe(400);
  });

  test('Rejects a request without credentials with a 401', async () => {
    const response = await server.inject('/items/7303000000000000001');

    expect(response.statusCode).toBe(401);
  });

  test('Documents the item as a named schema whose files have their own schema', async () => {
    const response = await server.inject('/openapi.json');

    const document = response.json();
    expect(document.paths['/items/{itemId}'].get.responses['200'].content['application/json'].schema).toEqual({ $ref: '#/components/schemas/ItemDetail' });
    expect(document.components.schemas.ItemDetail.properties.files.items).toEqual({ $ref: '#/components/schemas/ItemFile' });
  });
});
