import { HttpResponse } from '@spraxdev/node-commons/http';
import Zlib from 'node:zlib';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type SimpleHttpClient from '#src/http/SimpleHttpClient.js';
import { AniDbApiError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbApiError.js';
import { AniDbFloodControlError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbFloodControlError.js';
import { AniDbResponseError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbResponseError.js';
import type { AniDbBanState } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbBanState.js';
import type { AniDbFloodControl } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbFloodControl.js';
import { AniDbHttpTransport } from '#src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbHttpTransport.js';
import { AniDbXmlReader } from '#src/plugins/official/media/library/external_metadata/AniDb/xml/AniDbXmlReader.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';

const ANIME_RESPONSE = '<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>';

function createResponse(statusCode: number, body: Buffer | string): HttpResponse {
  return new HttpResponse(statusCode, new Map(), typeof body === 'string' ? Buffer.from(body) : body);
}

describe(AniDbHttpTransport, () => {
  let floodControl: DeepMockProxy<AniDbFloodControl>;
  let banState: DeepMockProxy<AniDbBanState>;
  let httpClient: DeepMockProxy<SimpleHttpClient>;
  let subject: AniDbHttpTransport;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    floodControl = createStrictDeepMock<AniDbFloodControl>();
    floodControl.run.mockImplementation((task) => task());

    banState = createStrictDeepMock<AniDbBanState>();
    banState.recordBan.mockResolvedValue(undefined);

    httpClient = createStrictDeepMock<SimpleHttpClient>();
    httpClient.get.mockResolvedValue(createResponse(200, ANIME_RESPONSE));

    subject = new AniDbHttpTransport(floodControl, banState, new AniDbXmlReader(), httpClient);
  });

  test('Returns a successful response body verbatim', async () => {
    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).resolves.toBe(ANIME_RESPONSE);
  });

  test('Runs the request through the flood control', async () => {
    await subject.fetchXml({ request: 'anime', aid: 1 });

    expect(floodControl.run).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
  });

  test('Does not contact the API when the flood control refuses the request', async () => {
    const floodControlError = new AniDbFloodControlError('Refusing to contact the AniDB API because the queue is backed up by about 30s');
    floodControl.run.mockRejectedValue(floodControlError);

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toBe(floodControlError);

    expect(httpClient.get).not.toHaveBeenCalled();
  });

  test('Asks for xml and identifies the client on every request', async () => {
    await subject.fetchXml({ request: 'anime', aid: 1 });

    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith('http://api.anidb.net:9001/httpapi', {
      headers: { 'Accept': 'application/xml' },
      query: { request: 'anime', aid: 1, protover: 1, client: 'apollodev', clientver: 1 },
    });
  });

  test('Does not let a caller override the client identification', async () => {
    await subject.fetchXml({ request: 'anime', protover: 99, client: 'someone-else', clientver: 42 });

    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith('http://api.anidb.net:9001/httpapi', expect.objectContaining({
      query: { request: 'anime', protover: 1, client: 'apollodev', clientver: 1 },
    }));
  });

  test('Decompresses a gzipped response body', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, Zlib.gzipSync(Buffer.from(ANIME_RESPONSE))));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).resolves.toBe(ANIME_RESPONSE);
  });

  test('Reports a body that claims to be gzipped but cannot be decompressed', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, Buffer.from([0x1f, 0x8b, 0x00, 0x01])));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbApiError);
    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow('AniDB API responded with bytes that could not be decompressed');
  });

  test.for([
    { kind: 'an empty body', body: Buffer.alloc(0), expected: '' },
    { kind: 'a single-byte body', body: Buffer.from([0x1f]), expected: '\x1f' },
  ])('Returns $kind verbatim although it is too short for the gzip magic bytes', async ({ body, expected }) => {
    httpClient.get.mockResolvedValue(createResponse(200, body));

    await expect(subject.fetchXml({ request: 'anime' })).resolves.toBe(expected);
  });

  test('Reports an unexpected status code together with the decoded body', async () => {
    httpClient.get.mockResolvedValue(createResponse(503, Zlib.gzipSync(Buffer.from('service unavailable'))));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(new AniDbApiError('AniDB API responded with unexpected status 503: service unavailable'));
  });

  test('Turns an error response into an AniDbResponseError carrying text and code', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, '<?xml version="1.0" encoding="UTF-8"?><error code="302">aid Missing or Invalid</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);
    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow('AniDB API responded with an error: aid Missing or Invalid (code=302)');
    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toMatchObject({ errorText: 'aid Missing or Invalid', errorCode: 302 });
  });

  test('Leaves the error code undefined when the response carries none', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, '<error>Anime not found</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);
    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toMatchObject({ errorText: 'Anime not found', errorCode: undefined });
  });

  test('Reports an error response that does not match the expected shape', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, '<error code="abc"></error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbApiError);
    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow('AniDB API responded with an invalid error body: <error code="abc"></error>');
  });

  test('Records the documented ban response without a warning', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, '<error>Banned</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);

    expect(banState.recordBan).toHaveBeenCalledExactlyOnceWith('Banned');
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('Records a response that only mentions a ban, and warns about its unexpected text', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, '<error code="500">Banned: too many requests</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);

    expect(banState.recordBan).toHaveBeenCalledExactlyOnceWith('Banned: too many requests');
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('"Banned: too many requests" (code=500)'));
  });

  test('Does not record a ban for an ordinary error response', async () => {
    httpClient.get.mockResolvedValue(createResponse(200, '<error code="330">Anime not found</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);

    expect(banState.recordBan).not.toHaveBeenCalled();
  });

  test('Does not record a ban that arrives with an unexpected status code', async () => {
    httpClient.get.mockResolvedValue(createResponse(503, '<error code="500">banned</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbApiError);

    expect(banState.recordBan).not.toHaveBeenCalled();
  });
});
