import { BadRequestError, NotFoundError } from '@sprax/node-framework';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { OpenApiRouter } from '#src/webserver/routes/api/OpenApiRouter.js';
import { WatchProgressRouter } from '#src/webserver/routes/api/media/v1/items/[itemId]/watch-progress/WatchProgressRouter.js';
import type { WatchProgressWriter } from '#src/webserver/routes/api/media/v1/items/[itemId]/watch-progress/WatchProgressWriter.js';
import type ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import {
  createTestWebServer,
  TEST_ACCESS_TOKEN,
  TEST_CSRF_TOKEN,
  TEST_SESSION_COOKIE,
  TEST_SESSION_TOKEN,
  TEST_USER,
} from '#tests/unit/webserver/createTestWebServer.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const URL = '/items/7303000000000000001/watch-progress';
const BEARER = { authorization: `Bearer ${TEST_ACCESS_TOKEN}` };
const SESSION_COOKIE = { cookie: `${TEST_SESSION_COOKIE}=${TEST_SESSION_TOKEN}` };

describe(WatchProgressRouter, () => {
  let watchProgressWriter: DeepMockProxy<WatchProgressWriter>;
  let server: ApolloWebServer;

  beforeEach(() => {
    watchProgressWriter = createStrictDeepMock<WatchProgressWriter>();
    watchProgressWriter.save.mockResolvedValue();
    watchProgressWriter.remove.mockResolvedValue();

    server = createTestWebServer(
      [{ router: new WatchProgressRouter(watchProgressWriter), prefix: '/items/:itemId/watch-progress' }, new OpenApiRouter()],
      { tokenUser: TEST_USER, sessionUser: TEST_USER },
    );
  });

  afterEach(async () => {
    await server.shutdown();
  });

  describe('when saving', () => {
    test('Saves the position for the authenticated user and answers 204 without a body', async () => {
      const response = await server.inject({ method: 'PUT', url: URL, headers: BEARER, payload: { positionSeconds: 754 } });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      expect(watchProgressWriter.save).toHaveBeenCalledExactlyOnceWith(TEST_USER, 7303000000000000001n, 754, undefined);
    });

    test('Passes the file the position refers to', async () => {
      await server.inject({ method: 'PUT', url: URL, headers: BEARER, payload: { positionSeconds: 754, fileId: '7303000000000000001' } });

      expect(watchProgressWriter.save).toHaveBeenCalledExactlyOnceWith(TEST_USER, 7303000000000000001n, 754, 7303000000000000001n);
    });

    test.for([
      { positionSeconds: -1 },
      { positionSeconds: 754.5 },
      { positionSeconds: '754' },
    ])('Rejects the position $positionSeconds with a 400 naming the field', async ({ positionSeconds }) => {
      const response = await server.inject({ method: 'PUT', url: URL, headers: BEARER, payload: { positionSeconds } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ context: 'body', issues: [{ path: '/positionSeconds' }] });
      expect(watchProgressWriter.save).not.toHaveBeenCalled();
    });

    test('Passes the 400 of a file that does not belong to the item through with its message', async () => {
      watchProgressWriter.save.mockRejectedValue(new BadRequestError('File \'7303000000000000002\' does not belong to item \'7303000000000000001\''));

      const response = await server.inject({ method: 'PUT', url: URL, headers: BEARER, payload: { positionSeconds: 754, fileId: '7303000000000000002' } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'File \'7303000000000000002\' does not belong to item \'7303000000000000001\'' });
    });

    test('Passes the 404 of the writer through with its message', async () => {
      watchProgressWriter.save.mockRejectedValue(new NotFoundError('Item \'7303000000000000001\' does not exist or you do not have access to it'));

      const response = await server.inject({ method: 'PUT', url: URL, headers: BEARER, payload: { positionSeconds: 754 } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'Item \'7303000000000000001\' does not exist or you do not have access to it' });
    });
  });

  describe('when forgetting', () => {
    test('Removes the position of the authenticated user and answers 204 without a body', async () => {
      const response = await server.inject({ method: 'DELETE', url: URL, headers: BEARER });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      expect(watchProgressWriter.remove).toHaveBeenCalledExactlyOnceWith(TEST_USER, 7303000000000000001n);
    });

    test('Passes the 404 of the writer through', async () => {
      watchProgressWriter.remove.mockRejectedValue(new NotFoundError('Item \'7303000000000000001\' does not exist or you do not have access to it'));

      const response = await server.inject({ method: 'DELETE', url: URL, headers: BEARER });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('with the session cookie instead of an access token', () => {
    test('Saves when the request carries the CSRF token in its header', async () => {
      const response = await server.inject({
        method: 'PUT', url: URL, headers: { ...SESSION_COOKIE, 'x-csrf-token': TEST_CSRF_TOKEN }, payload: { positionSeconds: 754 },
      });

      expect(response.statusCode).toBe(204);
      expect(watchProgressWriter.save).toHaveBeenCalledOnce();
    });

    test('Rejects a save without the CSRF token and writes nothing', async () => {
      const response = await server.inject({ method: 'PUT', url: URL, headers: SESSION_COOKIE, payload: { positionSeconds: 754 } });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'CSRF token is invalid' });
      expect(watchProgressWriter.save).not.toHaveBeenCalled();
    });

    test('Rejects a removal with a wrong CSRF token and removes nothing', async () => {
      const response = await server.inject({ method: 'DELETE', url: URL, headers: { ...SESSION_COOKIE, 'x-csrf-token': 'csrf_forged' } });

      expect(response.statusCode).toBe(400);
      expect(watchProgressWriter.remove).not.toHaveBeenCalled();
    });
  });

  test('Rejects a request without credentials with a 401', async () => {
    const response = await server.inject({ method: 'DELETE', url: URL });

    expect(response.statusCode).toBe(401);
  });

  test('Documents an empty 204 and the CSRF header for both operations', async () => {
    const response = await server.inject('/openapi.json');

    const path = response.json().paths['/items/{itemId}/watch-progress'];
    expect(path.put.requestBody.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/SaveWatchProgressInput' });
    expect(path.put.responses['204']).toEqual({ description: 'Saved' });
    expect(path.delete.responses['204']).toEqual({ description: 'Forgotten, or there was nothing to forget' });
    expect(path.put.parameters).toContainEqual(expect.objectContaining({ in: 'header', name: 'x-csrf-token', required: false }));
    expect(path.delete.parameters).toContainEqual(expect.objectContaining({ in: 'header', name: 'x-csrf-token', required: false }));
  });
});
