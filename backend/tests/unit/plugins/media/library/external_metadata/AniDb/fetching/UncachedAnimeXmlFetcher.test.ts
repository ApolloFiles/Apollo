import type { DeepMockProxy } from 'vitest-mock-extended';
import { AniDbApiError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbApiError.js';
import { AniDbResponseError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbResponseError.js';
import type { AniDbHttpTransport } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbHttpTransport.js';
import { UncachedAnimeXmlFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedAnimeXmlFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const ANIME_XML = '<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>';

function createFetcher(): {
  subject: UncachedAnimeXmlFetcher,
  mocks: { httpTransport: DeepMockProxy<AniDbHttpTransport> },
} {
  const httpTransport = createStrictDeepMock<AniDbHttpTransport>();
  httpTransport.fetchXml.mockResolvedValue(ANIME_XML);

  return { subject: new UncachedAnimeXmlFetcher(httpTransport), mocks: { httpTransport } };
}

describe('UncachedAnimeXmlFetcher#fetchXml', () => {
  test('Asks the transport for the anime with the given id', async () => {
    const { subject, mocks } = createFetcher();

    await subject.fetchXml(1337);

    expect(mocks.httpTransport.fetchXml).toHaveBeenCalledExactlyOnceWith({ request: 'anime', aid: 1337 });
  });

  test('Returns the response of the transport verbatim', async () => {
    const { subject } = createFetcher();

    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);
  });

  test('Returns null when the anime does not exist', async () => {
    const { subject, mocks } = createFetcher();
    mocks.httpTransport.fetchXml.mockRejectedValue(AniDbResponseError.create({ errorText: 'Anime not found', errorCode: 330 }));

    await expect(subject.fetchXml(1)).resolves.toBeNull();
  });

  test('Propagates any other error response from the transport', async () => {
    const { subject, mocks } = createFetcher();
    mocks.httpTransport.fetchXml.mockRejectedValue(AniDbResponseError.create({ errorText: 'aid Missing or Invalid', errorCode: 302 }));

    await expect(subject.fetchXml(1)).rejects.toThrow(AniDbResponseError);
  });

  test('Propagates errors that are not error responses', async () => {
    const { subject, mocks } = createFetcher();
    mocks.httpTransport.fetchXml.mockRejectedValue(new Error('Network down'));

    await expect(subject.fetchXml(1)).rejects.toThrow('Network down');
  });

  test('Accepts an anime response without an xml declaration', async () => {
    const { subject, mocks } = createFetcher();
    mocks.httpTransport.fetchXml.mockResolvedValue('<anime id="1"><type>TV Series</type></anime>');

    await expect(subject.fetchXml(1)).resolves.toBe('<anime id="1"><type>TV Series</type></anime>');
  });

  test.each([
    '',
    '<!DOCTYPE html><html><body>Maintenance</body></html>',
    '{"anime":1}',
    '<?xml version="1.0" encoding="UTF-8"?><animetitles></animetitles>',
  ])('Rejects a response that is not an anime: %j', async (responseBody) => {
    const { subject, mocks } = createFetcher();
    mocks.httpTransport.fetchXml.mockResolvedValue(responseBody);

    await expect(subject.fetchXml(1)).rejects.toThrow(AniDbApiError);
  });
});
