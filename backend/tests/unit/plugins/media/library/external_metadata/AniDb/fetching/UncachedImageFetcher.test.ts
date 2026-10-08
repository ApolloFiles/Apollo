import { HttpResponse } from '@spraxdev/node-commons/http';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type SimpleHttpClient from '#src/http/SimpleHttpClient.js';
import { AniDbCdnError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { UncachedImageFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedImageFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function createResponse(statusCode: number, headers: Record<string, string>, body: Buffer | string): HttpResponse {
  return new HttpResponse(statusCode, new Map(Object.entries(headers)), typeof body === 'string' ? Buffer.from(body) : body);
}

describe(UncachedImageFetcher, () => {
  let httpClient: DeepMockProxy<SimpleHttpClient>;
  let subject: UncachedImageFetcher;

  beforeEach(() => {
    httpClient = createStrictDeepMock<SimpleHttpClient>();
    httpClient.get.mockResolvedValue(createResponse(200, { 'content-type': 'image/jpeg' }, IMAGE_BYTES));

    subject = new UncachedImageFetcher(httpClient);
  });

  test('Requests the image from the CDN by its file name', async () => {
    await subject.fetchImage('294282.jpg');

    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith(
      'https://cdn.anidb.net/images/main/294282.jpg',
      { headers: { 'Accept': 'image/*' } },
    );
  });

  test('Returns the image bytes verbatim', async () => {
    await expect(subject.fetchImage('294282.jpg')).resolves.toEqual(IMAGE_BYTES);
  });

  test('Accepts any image content type', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, { 'content-type': 'image/png' }, IMAGE_BYTES));

    await expect(subject.fetchImage('67867.png')).resolves.toEqual(IMAGE_BYTES);
  });

  test('Reports a missing image with its file name', async () => {
    httpClient.get.mockResolvedValue(createResponse(404, { 'content-type': 'text/html' }, '<html>404</html>'));

    await expect(subject.fetchImage('999999999.jpg')).rejects.toThrow(new AniDbCdnError('The AniDB CDN responded with 404 Not Found for file 999999999.jpg'));
  });

  test('Reports any other unexpected status code together with the response body', async () => {
    httpClient.get.mockResolvedValue(createResponse(503, { 'content-type': 'text/plain' }, 'Service Unavailable'));

    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow(new AniDbCdnError('The AniDB CDN responded with unexpected status 503: Service Unavailable'));
  });

  test('Rejects a successful response that is not an image', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, { 'content-type': 'text/html' }, '<html>maintenance</html>'));

    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow(new AniDbCdnError('The AniDB CDN responded with non-image Content-Type "text/html" for file 294282.jpg'));
  });

  test('Rejects a successful response without a content type', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, {}, IMAGE_BYTES));

    await expect(subject.fetchImage('294282.jpg')).rejects.toThrow(new AniDbCdnError('The AniDB CDN responded with non-image Content-Type "" for file 294282.jpg'));
  });
});
