import type { DeepMockProxy } from 'vitest-mock-extended';
import { AniDbApiError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbApiError.js';
import { AniDbResponseError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbResponseError.js';
import type { AniDbHttpTransport } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbHttpTransport.js';
import { UncachedAnimeXmlFetcher } from '#src/plugins/official/media/library/external_metadata/AniDb/fetching/UncachedAnimeXmlFetcher.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const ANIME_XML = '<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>';

describe(UncachedAnimeXmlFetcher, () => {
  let httpTransport: DeepMockProxy<AniDbHttpTransport>;
  let subject: UncachedAnimeXmlFetcher;

  beforeEach(() => {
    httpTransport = createStrictDeepMock<AniDbHttpTransport>();
    httpTransport.fetchXml.mockResolvedValue(ANIME_XML);

    subject = new UncachedAnimeXmlFetcher(httpTransport);
  });

  test('Asks the transport for the anime with the given id', async () => {
    await subject.fetchXml(1337);

    expect(httpTransport.fetchXml).toHaveBeenCalledExactlyOnceWith({ request: 'anime', aid: 1337 });
  });

  test('Returns the response of the transport verbatim', async () => {
    await expect(subject.fetchXml(1)).resolves.toBe(ANIME_XML);
  });

  test('Returns null when the anime does not exist', async () => {
    httpTransport.fetchXml.mockRejectedValue(AniDbResponseError.create({ errorText: 'Anime not found', errorCode: 330 }));

    await expect(subject.fetchXml(1)).resolves.toBeNull();
  });

  test('Propagates any other error response from the transport', async () => {
    const responseError = AniDbResponseError.create({ errorText: 'aid Missing or Invalid', errorCode: 302 });
    httpTransport.fetchXml.mockRejectedValue(responseError);

    await expect(subject.fetchXml(1)).rejects.toBe(responseError);
  });

  test('Propagates errors that are not error responses', async () => {
    const networkError = new Error('Network down');
    httpTransport.fetchXml.mockRejectedValue(networkError);

    await expect(subject.fetchXml(1)).rejects.toBe(networkError);
  });

  test('Accepts an anime response without an xml declaration', async () => {
    httpTransport.fetchXml.mockResolvedValue('<anime id="1"><type>TV Series</type></anime>');

    await expect(subject.fetchXml(1)).resolves.toBe('<anime id="1"><type>TV Series</type></anime>');
  });

  test.for([
    { responseBody: '' },
    { responseBody: '<!DOCTYPE html><html><body>Maintenance</body></html>' },
    { responseBody: '{"anime":1}' },
    { responseBody: '<?xml version="1.0" encoding="UTF-8"?><animetitles></animetitles>' },
  ])('Rejects a response that is not an anime: "$responseBody"', async ({ responseBody }) => {
    httpTransport.fetchXml.mockResolvedValue(responseBody);

    await expect(subject.fetchXml(1)).rejects.toThrow(new AniDbApiError(`AniDB API responded with something that is not an anime: ${responseBody}`));
  });
});
