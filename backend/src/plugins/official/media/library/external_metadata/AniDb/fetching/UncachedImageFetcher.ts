import type { HttpResponse } from '@spraxdev/node-commons/http';
import { singleton } from 'tsyringe';
import SimpleHttpClient from '../../../../../../../http/SimpleHttpClient.js';
import { AniDbCdnError } from '../errors/AniDbCdnError.js';

/** @internal */
@singleton()
export class UncachedImageFetcher {
  private static readonly CDN_BASE_URL = 'https://cdn.anidb.net/images/main/';

  constructor(
    private readonly httpClient: SimpleHttpClient,
  ) {
  }

  async fetchImage(fileName: string): Promise<Buffer> {
    const cdnResponse = await this.httpClient.get(
      UncachedImageFetcher.CDN_BASE_URL + fileName,
      { headers: { 'Accept': 'image/*' } },
    );

    this.handleUnexpectedStatusCode(cdnResponse, fileName);
    this.handleUnexpectedContentType(cdnResponse, fileName);

    return cdnResponse.body;
  }

  private handleUnexpectedStatusCode(cdnResponse: HttpResponse, fileName: string): void {
    if (cdnResponse.statusCode == 404) {
      throw AniDbCdnError.createForNotFoundResponse(fileName);
    }

    if (cdnResponse.statusCode != 200) {
      throw AniDbCdnError.createForUnexpectedHttpStatusCode(cdnResponse.statusCode, cdnResponse.parseBodyAsText());
    }
  }

  private handleUnexpectedContentType(cdnResponse: HttpResponse, fileName: string): void {
    const contentType = cdnResponse.getHeader('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw AniDbCdnError.createForUnexpectedResponseContentType(contentType, fileName);
    }
  }
}
