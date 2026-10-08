import type { ZodError } from 'zod';
import { AniDbError } from './AniDbError.js';

export class AniDbApiError extends AniDbError {
  /** @internal */
  static createForUnexpectedHttpStatusCode(code: number, responseBody: string): AniDbApiError {
    return new AniDbApiError(`AniDB API responded with unexpected status ${code}: ${responseBody}`);
  }

  /** @internal */
  static createForErrorDecompressingBody(responseBody: Buffer, cause: Error): AniDbApiError {
    return new AniDbApiError(`AniDB API responded with bytes that could not be decompressed: ${responseBody.toString()}`, { cause });
  }

  /** @internal */
  static createForUnexpectedAnimeResponse(responseBody: string): AniDbApiError {
    return new AniDbApiError(`AniDB API responded with something that is not an anime: ${responseBody}`);
  }

  /** @internal */
  static createForInvalidErrorResponse(responseBody: string, cause: ZodError): AniDbApiError {
    return new AniDbApiError(`AniDB API responded with an invalid error body: ${responseBody}`, { cause });
  }
}
