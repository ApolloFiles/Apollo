import { ZodError } from 'zod';
import { TmdbApiError } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbApiError.js';
import { TmdbError } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbError.js';
import { TmdbErrorClassifier } from '#src/plugins/official/media/library/external_metadata/tmdb/errors/TmdbErrorClassifier.js';

function createNetworkError(code: string): Error {
  return Object.assign(new Error(`connect ${code} 13.227.94.32:443`), { code });
}

describe(TmdbErrorClassifier, () => {
  test.for([429, 500, 503])('Counts the status %i as transient', (statusCode) => {
    const error = TmdbApiError.createForUnexpectedHttpStatusCode('https://api.themoviedb.org/3/movie/550', statusCode, 'Service Unavailable');

    expect(TmdbErrorClassifier.isTransient(error)).toBe(true);
  });

  test.for([401, 403])('Counts the status %i as permanent', (statusCode) => {
    const error = TmdbApiError.createForUnexpectedHttpStatusCode('https://api.themoviedb.org/3/movie/550', statusCode, 'Invalid API key');

    expect(TmdbErrorClassifier.isTransient(error)).toBe(false);
  });

  test('Counts a body that does not match the schema as permanent', () => {
    const error = TmdbApiError.createForInvalidResponse('https://api.themoviedb.org/3/movie/550', '{"id":550,"title":null}', new ZodError([]));

    expect(TmdbErrorClassifier.isTransient(error)).toBe(false);
  });

  test('Counts a missing access token as permanent', () => {
    expect(TmdbErrorClassifier.isTransient(new TmdbError('The API read access token is not configured'))).toBe(false);
  });

  test('Counts a network failure as transient', () => {
    expect(TmdbErrorClassifier.isTransient(createNetworkError('ECONNRESET'))).toBe(true);
  });

  test('Counts a programming error as permanent', () => {
    expect(TmdbErrorClassifier.isTransient(new TypeError('Cannot read properties of undefined (reading \'images\')'))).toBe(false);
  });
});
