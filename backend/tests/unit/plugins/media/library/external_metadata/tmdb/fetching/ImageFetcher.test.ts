import { HttpResponse } from '@spraxdev/node-commons/http';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type SimpleHttpClient from '#src/http/SimpleHttpClient.js';
import { TmdbApiError } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbApiError.js';
import { ImageFetcher } from '#src/plugins/official/media/library/external_metadata/tmdb/fetching/ImageFetcher.js';
import { type ApiConfiguration, TMDB_CONFIGURATION_SCHEMA } from '#src/plugins/official/media/library/external_metadata/tmdb/schema/ConfigurationSchema.js';
import type { TmdbHttpTransport } from '#src/plugins/official/media/library/external_metadata/tmdb/transport/TmdbHttpTransport.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const API_CONFIGURATION: ApiConfiguration = {
  change_keys: ['adult', 'air_date', 'images', 'translations'],
  images: {
    base_url: 'http://image.tmdb.org/t/p/',
    secure_base_url: 'https://image.tmdb.org/t/p/',
    backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
    logo_sizes: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
    poster_sizes: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
    profile_sizes: ['w45', 'w185', 'h632', 'original'],
    still_sizes: ['w92', 'w185', 'w300', 'original'],
  },
};

function createResponse(statusCode: number, contentType: string, body: Buffer | string): HttpResponse {
  return new HttpResponse(statusCode, new Map([['content-type', contentType]]), typeof body === 'string' ? Buffer.from(body) : body);
}

describe(ImageFetcher, () => {
  let httpTransport: DeepMockProxy<TmdbHttpTransport>;
  let httpClient: DeepMockProxy<SimpleHttpClient>;
  let subject: ImageFetcher;

  beforeEach(() => {
    httpTransport = createStrictDeepMock<TmdbHttpTransport>();
    httpTransport.fetchJson.mockResolvedValue(API_CONFIGURATION);

    const responsesByUrl = new Map([
      ['https://image.tmdb.org/t/p/original/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', createResponse(200, 'image/jpeg', JPEG_BYTES)],
      ['https://image.tmdb.org/t/p/original/rr7E0NoGKxvbkb89eR1GwfoYjpA.png', createResponse(200, 'image/png', PNG_BYTES)],
    ]);
    httpClient = createStrictDeepMock<SimpleHttpClient>();
    httpClient.get.mockImplementation(async (url) => responsesByUrl.get(url) ?? createResponse(404, 'text/html', '<html>404 Not Found</html>'));

    subject = new ImageFetcher(httpTransport, httpClient);
  });

  test('Requests the original size from the secure base URL of the API configuration', async () => {
    await subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');

    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith(
      'https://image.tmdb.org/t/p/original/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
      { headers: { 'Accept': 'image/*' } },
    );
  });

  test('Returns the image bytes verbatim', async () => {
    await expect(subject.fetchImage('/rr7E0NoGKxvbkb89eR1GwfoYjpA.png')).resolves.toEqual(PNG_BYTES);
  });

  test('Returns null when the image does not exist', async () => {
    await expect(subject.fetchImage('/doesNotExist1234567890abcde.jpg')).resolves.toBeNull();
  });

  describe('API configuration', () => {
    test('Fetches the configuration with its schema', async () => {
      await subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');

      expect(httpTransport.fetchJson).toHaveBeenCalledExactlyOnceWith('/configuration', TMDB_CONFIGURATION_SCHEMA);
    });

    test('Fetches the configuration only once for several images', async () => {
      await subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg');
      await subject.fetchImage('/rr7E0NoGKxvbkb89eR1GwfoYjpA.png');

      expect(httpTransport.fetchJson).toHaveBeenCalledOnce();
    });

    test('Fetches the configuration again after a failed attempt', async () => {
      httpTransport.fetchJson.mockRejectedValueOnce(TmdbApiError.createForUnexpectedHttpStatusCode('https://api.themoviedb.org/3/configuration', 503, 'Service Unavailable'));
      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).rejects.toThrow(TmdbApiError);

      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).resolves.toEqual(JPEG_BYTES);
    });

    test('Reports a configuration TMDB does not know', async () => {
      httpTransport.fetchJson.mockResolvedValue(null);

      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).rejects.toThrow(TmdbApiError.createForMissingConfiguration());
    });
  });

  describe('when the CDN does not deliver an image', () => {
    test.for([429, 502, 503])('Reports the status %i as transient', async (statusCode) => {
      httpClient.get.mockResolvedValue(createResponse(statusCode, 'text/html', '<html>Bad Gateway</html>'));

      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).rejects.toMatchObject({ name: 'TmdbApiError', isTransient: true });
    });

    test('Reports an unexpected status as permanent, naming the image URL', async () => {
      httpClient.get.mockResolvedValue(createResponse(403, 'text/html', '<html>Forbidden</html>'));

      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).rejects.toMatchObject({
        name: 'TmdbApiError',
        isTransient: false,
        message: expect.stringContaining('unexpected status 403 for https://image.tmdb.org/t/p/original/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg'),
      });
    });

    test('Rejects a successful response that is not an image', async () => {
      httpClient.get.mockResolvedValue(createResponse(200, 'text/html', '<html>Maintenance</html>'));

      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).rejects.toThrow(
        TmdbApiError.createForUnexpectedImageContentType('https://image.tmdb.org/t/p/original/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', 'text/html'),
      );
    });

    test('Rejects a successful response without a content type', async () => {
      httpClient.get.mockResolvedValue(new HttpResponse(200, new Map(), JPEG_BYTES));

      await expect(subject.fetchImage('/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg')).rejects.toThrow(
        TmdbApiError.createForUnexpectedImageContentType('https://image.tmdb.org/t/p/original/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', ''),
      );
    });
  });
});
