import type { HttpResponse } from '@spraxdev/node-commons/http';
import Util from 'node:util';
import Zlib from 'node:zlib';
import { singleton } from 'tsyringe';
import SimpleHttpClient from '../../../../../../../http/SimpleHttpClient.js';
import { AniDbApiError } from '../errors/AniDbApiError.js';
import { AniDbResponseError } from '../errors/AniDbResponseError.js';
import { AniDbXmlReader } from '../xml/AniDbXmlReader.js';
import { AniDbBanState } from './AniDbBanState.js';
import { AniDbFloodControl } from './AniDbFloodControl.js';
import { ERROR_RESPONSE_SCHEMA, LOOKS_LIKE_ERROR_RESPONSE } from './ErrorSchema.js';

type FetchParams = { [key: string]: string | number };

const gunzipAsync = Util.promisify(Zlib.gunzip);

/** @internal */
@singleton()
export class AniDbHttpTransport {
  private static readonly API_URL = 'http://api.anidb.net:9001/httpapi';
  private static readonly API_PROTOCOL_VERSION = 1;
  private static readonly CLIENT_NAME = 'apollodev';
  private static readonly CLIENT_VERSION = 1;

  private static readonly GZIP_MAGIC_BYTES = Buffer.from([0x1f, 0x8b]);

  constructor(
    private readonly floodControl: AniDbFloodControl,
    private readonly banState: AniDbBanState,
    private readonly xmlReader: AniDbXmlReader,
    private readonly httpClient: SimpleHttpClient,
  ) {
  }

  async fetchXml(params: FetchParams): Promise<string> {
    const response = await this.floodControl.run(() => this.executeRequest(params));

    const responseBody = await this.decodeResponseBody(response.body);

    if (response.statusCode !== 200) {
      throw AniDbApiError.createForUnexpectedHttpStatusCode(response.statusCode, responseBody);
    }

    await this.throwIfErrorResponse(responseBody);

    return responseBody;
  }

  private executeRequest(params: FetchParams): Promise<HttpResponse> {
    return this.httpClient.get(AniDbHttpTransport.API_URL, {
      headers: { 'Accept': 'application/xml' },
      query: {
        ...params,

        'protover': AniDbHttpTransport.API_PROTOCOL_VERSION,
        'client': AniDbHttpTransport.CLIENT_NAME,
        'clientver': AniDbHttpTransport.CLIENT_VERSION,
      },
    });
  }

  private async decodeResponseBody(body: Buffer): Promise<string> {
    if (!body.subarray(0, 2).equals(AniDbHttpTransport.GZIP_MAGIC_BYTES)) {
      return body.toString('utf-8');
    }

    try {
      return (await gunzipAsync(body)).toString('utf-8');
    } catch (err) {
      throw AniDbApiError.createForErrorDecompressingBody(body, err as Error);
    }
  }

  private async throwIfErrorResponse(responseBody: string): Promise<void> {
    if (!LOOKS_LIKE_ERROR_RESPONSE.test(responseBody)) {
      return;
    }

    const parsedXml = this.xmlReader.read(responseBody);
    const parsedError = ERROR_RESPONSE_SCHEMA.safeParse(parsedXml);
    if (!parsedError.success) {
      throw AniDbApiError.createForInvalidErrorResponse(responseBody, parsedError.error);
    }

    const responseError = AniDbResponseError.create(parsedError.data);
    if (this.isBanError(responseError)) {
      await this.banState.recordBan(responseError.errorText);
    }

    throw responseError;
  }

  /** no official documentation on how to detect errors :/ */
  private isBanError(error: AniDbResponseError): boolean {
    if (error.errorText === 'Banned') {
      return true;
    }

    if (error.errorText.toLowerCase().includes('banned')) {
      console.warn(`[AniDB] Treating an error response as a ban, although it is not the documented "Banned": ${JSON.stringify(error.errorText)} (code=${error.errorCode})`);
      return true;
    }

    return false;
  }
}
