import { HttpResponse } from '@spraxdev/node-commons/http';
import Zlib from 'node:zlib';
import { describe, expect, test, vi } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import type SimpleHttpClient from '../../../../../../../../src/http/SimpleHttpClient.js';
import { AniDbApiError } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbApiError.js';
import { AniDbFloodControlError } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbFloodControlError.js';
import { AniDbResponseError } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbResponseError.js';
import type { AniDbBanState } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbBanState.js';
import type { AniDbFloodControl } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbFloodControl.js';
import { AniDbHttpTransport } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/transport/AniDbHttpTransport.js';
import { AniDbXmlReader } from '../../../../../../../../src/plugins/official/media/library/external_metadata/AniDb/xml/AniDbXmlReader.js';
import { createStrictDeepMock } from '../../../../../../../test-helpers.js';

const ANIME_RESPONSE = '<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>';
const GZIP_MAGIC_BYTE = 0x1f;

function createResponse(statusCode: number, body: Buffer | string): HttpResponse {
  return new HttpResponse(statusCode, new Map(), typeof body === 'string' ? Buffer.from(body) : body);
}

function createTransport(response: HttpResponse = createResponse(200, ANIME_RESPONSE)): {
  subject: AniDbHttpTransport,
  mocks: {
    floodControl: DeepMockProxy<AniDbFloodControl>,
    banState: DeepMockProxy<AniDbBanState>,
    httpClient: DeepMockProxy<SimpleHttpClient>,
  },
} {
  const floodControl = createStrictDeepMock<AniDbFloodControl>();
  floodControl.run.mockImplementation((task: () => Promise<unknown>) => task() as any);

  const banState = createStrictDeepMock<AniDbBanState>();
  banState.recordBan.mockResolvedValue(undefined);

  const httpClient = createStrictDeepMock<SimpleHttpClient>();
  httpClient.get.mockResolvedValue(response);

  return {
    subject: new AniDbHttpTransport(floodControl, banState, new AniDbXmlReader(), httpClient),
    mocks: { floodControl, banState, httpClient },
  };
}

describe('AniDbHttpTransport#fetchXml', () => {
  test('Returns a successful response body verbatim', async () => {
    const { subject } = createTransport();

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).resolves.toBe(ANIME_RESPONSE);
  });

  test('Runs the request through the flood control', async () => {
    const { subject, mocks } = createTransport();

    await subject.fetchXml({ request: 'anime', aid: 1 });

    expect(mocks.floodControl.run).toHaveBeenCalledTimes(1);
  });

  test('Does not contact the API when the flood control refuses the request', async () => {
    const { subject, mocks } = createTransport();
    mocks.floodControl.run.mockRejectedValue(new AniDbFloodControlError('queue is backed up'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbFloodControlError);
    expect(mocks.httpClient.get).not.toHaveBeenCalled();
  });

  test('Asks for xml and identifies the client on every request', async () => {
    const { subject, mocks } = createTransport();

    await subject.fetchXml({ request: 'anime', aid: 1 });

    const [url, options] = mocks.httpClient.get.mock.calls[0];
    expect(url).toBe('http://api.anidb.net:9001/httpapi');
    expect(options?.headers).toEqual({ 'Accept': 'application/xml' });
    expect(options?.query).toEqual({
      request: 'anime',
      aid: 1,
      protover: 1,
      client: 'apollodev',
      clientver: 1,
    });
  });

  test('Does not let a caller override the client identification', async () => {
    const { subject, mocks } = createTransport();

    await subject.fetchXml({ request: 'anime', protover: 99, client: 'someone-else', clientver: 42 });

    expect(mocks.httpClient.get.mock.calls[0][1]?.query).toMatchObject({
      protover: 1,
      client: 'apollodev',
      clientver: 1,
    });
  });

  test('Decompresses a gzipped response body', async () => {
    const { subject } = createTransport(createResponse(200, Zlib.gzipSync(Buffer.from(ANIME_RESPONSE))));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).resolves.toBe(ANIME_RESPONSE);
  });

  test('Reports a body that claims to be gzipped but cannot be decompressed', async () => {
    const { subject } = createTransport(createResponse(200, Buffer.from([GZIP_MAGIC_BYTE, 0x8b, 0x00, 0x01])));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbApiError);
  });

  test('Handles bodies too short to carry the gzip magic bytes', async () => {
    const empty = createTransport(createResponse(200, Buffer.alloc(0)));
    const singleByte = createTransport(createResponse(200, Buffer.from([GZIP_MAGIC_BYTE])));

    await expect(empty.subject.fetchXml({ request: 'anime' })).resolves.toBe('');
    await expect(singleByte.subject.fetchXml({ request: 'anime' })).resolves.toBe(String.fromCharCode(GZIP_MAGIC_BYTE));
  });

  test('Reports an unexpected status code together with the decoded body', async () => {
    const { subject } = createTransport(createResponse(503, Zlib.gzipSync(Buffer.from('service unavailable'))));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbApiError);
    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(/503.*service unavailable/);
  });

  test('Turns an error response into an AniDbResponseError carrying text and code', async () => {
    const { subject } = createTransport(createResponse(200, '<?xml version="1.0" encoding="UTF-8"?><error code="500">banned</error>'));

    const error = await subject.fetchXml({ request: 'anime', aid: 1 }).catch((err) => err);

    expect(error).toBeInstanceOf(AniDbResponseError);
    expect(error.errorText).toBe('banned');
    expect(error.errorCode).toBe(500);
  });

  test('Leaves the error code undefined when the response carries none', async () => {
    const { subject } = createTransport(createResponse(200, '<error>Anime not found</error>'));

    const error = await subject.fetchXml({ request: 'anime', aid: 1 }).catch((err) => err);

    expect(error).toBeInstanceOf(AniDbResponseError);
    expect(error.errorText).toBe('Anime not found');
    expect(error.errorCode).toBeUndefined();
  });

  test('Reports an error response that does not match the expected shape', async () => {
    const { subject } = createTransport(createResponse(200, '<error code="abc"></error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbApiError);
  });

  test('Records the documented ban response without a warning', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { subject, mocks } = createTransport(createResponse(200, '<error>Banned</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);

    expect(mocks.banState.recordBan).toHaveBeenCalledExactlyOnceWith('Banned');
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  test('Records a response that only mentions a ban, and warns about its unexpected text', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { subject, mocks } = createTransport(createResponse(200, '<error code="500">Banned: too many requests</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);

    expect(mocks.banState.recordBan).toHaveBeenCalledExactlyOnceWith('Banned: too many requests');
    expect(consoleWarn).toHaveBeenCalledOnce();
    expect(consoleWarn.mock.calls[0][0]).toContain('"Banned: too many requests" (code=500)');
  });

  test('Does not record a ban for an ordinary error response', async () => {
    const { subject, mocks } = createTransport(createResponse(200, '<error code="330">Anime not found</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbResponseError);

    expect(mocks.banState.recordBan).not.toHaveBeenCalled();
  });

  test('Does not record a ban that arrives with an unexpected status code', async () => {
    const { subject, mocks } = createTransport(createResponse(503, '<error code="500">banned</error>'));

    await expect(subject.fetchXml({ request: 'anime', aid: 1 })).rejects.toThrow(AniDbApiError);

    expect(mocks.banState.recordBan).not.toHaveBeenCalled();
  });
});
