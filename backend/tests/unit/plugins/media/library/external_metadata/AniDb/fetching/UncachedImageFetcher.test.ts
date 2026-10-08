import { HttpResponse } from '@spraxdev/node-commons/http';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type SimpleHttpClient from '#src/http/SimpleHttpClient.js';
import { AniDbCdnError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { UncachedImageFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedImageFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function createResponse(statusCode: number, contentType: string | null, body: Buffer | string): HttpResponse {
  const headers = new Map<string, string>();
  if (contentType != null) {
    headers.set('content-type', contentType);
  }
  return new HttpResponse(statusCode, headers, typeof body === 'string' ? Buffer.from(body) : body);
}

function createFetcher(response: HttpResponse = createResponse(200, 'image/jpeg', IMAGE_BYTES)): {
  subject: UncachedImageFetcher,
  mocks: { httpClient: DeepMockProxy<SimpleHttpClient> },
} {
  const httpClient = createStrictDeepMock<SimpleHttpClient>();
  httpClient.get.mockResolvedValue(response);

  return { subject: new UncachedImageFetcher(httpClient), mocks: { httpClient } };
}

describe('UncachedImageFetcher#fetchImage', () => {
  test('Requests the image from the CDN by its file name', async () => {
    const { subject, mocks } = createFetcher();

    await subject.fetchImage('294282.jpg');

    expect(mocks.httpClient.get).toHaveBeenCalledExactlyOnceWith(
      'https://cdn.anidb.net/images/main/294282.jpg',
      { headers: { 'Accept': 'image/*' } },
    );
  });

  test('Returns the image bytes verbatim', async () => {
    const { subject } = createFetcher();

    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);
  });

  test('Accepts any image content type', async () => {
    const { subject } = createFetcher(createResponse(200, 'image/png', IMAGE_BYTES));

    await expect(subject.fetchImage('67867.png')).resolves.toEqual(IMAGE_BYTES);
  });

  test('Reports a missing image with its file name', async () => {
    const { subject } = createFetcher(createResponse(404, 'text/html', '<html>404</html>'));

    await expect(subject.fetchImage('999999999.jpg')).rejects.toThrow(AniDbCdnError);
    await expect(subject.fetchImage('999999999.jpg')).rejects.toThrow('404 Not Found for file 999999999.jpg');
  });

  test('Reports any other unexpected status code together with the response body', async () => {
    const { subject } = createFetcher(createResponse(503, 'text/plain', 'Service Unavailable'));

    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow(AniDbCdnError);
    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow('unexpected status 503: Service Unavailable');
  });

  test('Rejects a successful response that is not an image', async () => {
    const { subject } = createFetcher(createResponse(200, 'text/html', '<html>maintenance</html>'));

    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow(AniDbCdnError);
    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow('non-image Content-Type "text/html"');
  });

  test('Rejects a successful response without a content type', async () => {
    const { subject } = createFetcher(createResponse(200, null, IMAGE_BYTES));

    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow('non-image Content-Type ""');
  });
});
