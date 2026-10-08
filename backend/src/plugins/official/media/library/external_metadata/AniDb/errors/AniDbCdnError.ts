import { AniDbError } from './AniDbError.js';

export class AniDbCdnError extends AniDbError {
  /** @internal */
  static createForUnexpectedHttpStatusCode(code: number, responseBody: string): AniDbCdnError {
    return new AniDbCdnError(`The AniDB CDN responded with unexpected status ${code}: ${responseBody}`);
  }

  /** @internal */
  static createForNotFoundResponse(fileName: string): AniDbCdnError {
    return new AniDbCdnError(`The AniDB CDN responded with 404 Not Found for file ${fileName}`);
  }

  /** @internal */
  static createForUnexpectedResponseContentType(contentType: string, fileName: string): AniDbCdnError {
    return new AniDbCdnError(`The AniDB CDN responded with non-image Content-Type ${JSON.stringify(contentType)} for file ${fileName}`);
  }
}
