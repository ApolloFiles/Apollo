import { BadRequestError, NotFoundError } from '@sprax/node-framework';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type { CachedValue } from '#src/cache/CacheEntry.js';
import type { CacheEntryResponder } from '#src/cache/http/CacheEntryResponder.js';
import type { MediaImageQuery } from '#src/webserver/routes/api/media/v1/media/[mediaId]/images/MediaImageQuery.js';
import { MediaImagesRouter } from '#src/webserver/routes/api/media/v1/media/[mediaId]/images/MediaImagesRouter.js';
import { OpenApiRouter } from '#src/webserver/routes/api/OpenApiRouter.js';
import type ApolloWebServer from '#src/webserver/server/ApolloWebServer.js';
import { createTestWebServer, TEST_ACCESS_TOKEN, TEST_USER } from '#tests/unit/webserver/createTestWebServer.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const JPEG_BYTES = Buffer.from('ffd8ffe000104a464946', 'hex');

describe(MediaImagesRouter, () => {
  let mediaImageQuery: DeepMockProxy<MediaImageQuery>;
  let cacheEntryResponder: DeepMockProxy<CacheEntryResponder>;
  let image: CachedValue<Buffer>;
  let server: ApolloWebServer;

  beforeEach(() => {
    image = createStrictDeepMock<CachedValue<Buffer>>();
    mediaImageQuery = createStrictDeepMock<MediaImageQuery>();
    mediaImageQuery.run.mockResolvedValue(image);
    cacheEntryResponder = createStrictDeepMock<CacheEntryResponder>();
    cacheEntryResponder.send.mockImplementation(async (_request, reply) => reply.type('image/jpeg').send(JPEG_BYTES));

    server = createTestWebServer([
      { router: new MediaImagesRouter(mediaImageQuery, cacheEntryResponder), prefix: '/media/:mediaId/images' },
      new OpenApiRouter(),
    ]);
  });

  afterEach(async () => {
    await server.shutdown();
  });

  async function get(url: string) {
    return server.inject({ url, headers: { authorization: `Bearer ${TEST_ACCESS_TOKEN}` } });
  }

  test('Serves the image the query found through the cache entry responder as a private, briefly cacheable response', async () => {
    const response = await get('/media/7302000000000000003/images/poster?format=jpeg');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.rawPayload).toEqual(JPEG_BYTES);
    expect(cacheEntryResponder.send).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.anything(), image, { cacheControl: 'private, max-age=300' });
  });

  test('Asks for the kind and format of the URL on behalf of the authenticated user', async () => {
    await get('/media/7302000000000000003/images/logo?format=avif');

    expect(mediaImageQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, 7302000000000000003n, 'logo', 'avif');
  });

  test('Asks for AVIF when the URL names no format', async () => {
    await get('/media/7302000000000000003/images/poster');

    expect(mediaImageQuery.run).toHaveBeenCalledExactlyOnceWith(TEST_USER, 7302000000000000003n, 'poster', 'avif');
  });

  test.for([
    '/media/7302000000000000003/images/thumbnail?format=jpeg',
    '/media/7302000000000000003/images/poster?format=webp',
    '/media/akira/images/poster?format=jpeg',
  ])('Rejects %s with a 400 before looking anything up', async (url) => {
    const response = await get(url);

    expect(response.statusCode).toBe(400);
    expect(mediaImageQuery.run).not.toHaveBeenCalled();
  });

  test('Passes a 404 of the query through with its message', async () => {
    mediaImageQuery.run.mockRejectedValue(new NotFoundError('Media \'7302000000000000003\' has no backdrop'));

    const response = await get('/media/7302000000000000003/images/backdrop?format=jpeg');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Media \'7302000000000000003\' has no backdrop' });
  });

  test('Passes a 400 of the query through with its message', async () => {
    mediaImageQuery.run.mockRejectedValue(new BadRequestError('Format \'png\' is not available for \'poster\''));

    const response = await get('/media/7302000000000000003/images/poster?format=png');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Format \'png\' is not available for \'poster\'' });
  });

  test('Rejects a request without credentials with a 401', async () => {
    const response = await server.inject('/media/7302000000000000003/images/poster?format=jpeg');

    expect(response.statusCode).toBe(401);
  });

  test('Documents the three image formats as binary responses and AVIF as the default format', async () => {
    const response = await server.inject('/openapi.json');

    const operation = response.json().paths['/media/{mediaId}/images/{kind}'].get;
    expect(Object.keys(operation.responses['200'].content)).toEqual(['image/avif', 'image/jpeg', 'image/png']);
    expect(operation.responses['200'].content['image/jpeg'].schema).toEqual({ type: 'string', format: 'binary' });
    const formatParameter = operation.parameters.find((parameter: { name: string }) => parameter.name === 'format');
    expect(formatParameter.required).toBe(false);
    expect(formatParameter.schema.default).toBe('avif');
  });
});
