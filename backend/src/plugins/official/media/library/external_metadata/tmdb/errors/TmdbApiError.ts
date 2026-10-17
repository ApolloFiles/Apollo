import type { ZodError } from 'zod';
import { ExternalApiErrorClassifier } from '../../ExternalApiErrorClassifier.js';
import { TmdbError } from './TmdbError.js';

export class TmdbApiError extends TmdbError {
  /** @internal */
  static createForUnexpectedHttpStatusCode(url: string, code: number, responseBody: string): TmdbApiError {
    return new TmdbApiError(
      `TMDB responded with unexpected status ${code} for ${url}: ${responseBody}`,
      { isTransient: ExternalApiErrorClassifier.isTransientHttpStatus(code) },
    );
  }

  /** @internal */
  static createForInvalidResponse(url: string, body: string, cause: ZodError | SyntaxError): TmdbApiError {
    return new TmdbApiError(`TMDB responded with an invalid body for ${url}: ${body}`, { cause });
  }

  /** @internal */
  static createForMissingConfiguration(): TmdbApiError {
    return new TmdbApiError('TMDB responded with 404 Not Found for its API configuration, so no image URL can be built');
  }

  /** @internal */
  static createForUnexpectedImageContentType(url: string, contentType: string): TmdbApiError {
    return new TmdbApiError(`TMDB responded with non-image Content-Type ${JSON.stringify(contentType)} for ${url}`);
  }
}
