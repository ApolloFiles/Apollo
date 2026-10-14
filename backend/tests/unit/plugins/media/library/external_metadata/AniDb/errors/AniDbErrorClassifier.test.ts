import { AniDbApiError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbApiError.js';
import { AniDbCdnError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbCdnError.js';
import { AniDbErrorClassifier } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbErrorClassifier.js';
import { AniDbFloodControlError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbFloodControlError.js';
import { AniDbResponseError } from '#src/plugins/official/media/library/external_metadata/AniDb/errors/AniDbResponseError.js';

function createNetworkError(code: string): Error {
  return Object.assign(new Error(`connect ${code} 203.0.113.17:9001`), { code });
}

describe(AniDbErrorClassifier, () => {
  test('Counts a request refused because of an active ban as transient', () => {
    const ban = { bannedAt: new Date('2026-10-14T08:00:00Z'), bannedUntil: new Date('2026-10-14T16:00:00Z'), reason: 'Banned' };

    expect(AniDbErrorClassifier.isTransient(AniDbFloodControlError.createForActiveBan(ban))).toBe(true);
  });

  test('Counts a request refused because the queue is backed up as transient', () => {
    expect(AniDbErrorClassifier.isTransient(AniDbFloodControlError.createForExceededQueueWaitTime(30_000))).toBe(true);
  });

  test('Counts a request cancelled by the shutdown as transient', () => {
    expect(AniDbErrorClassifier.isTransient(AniDbFloodControlError.createForShutdown())).toBe(true);
  });

  test.for([
    'Banned',
    'Banned: too many requests',
  ])('Counts the ban response "%s" as transient', (errorText) => {
    expect(AniDbErrorClassifier.isTransient(AniDbResponseError.create({ errorText, errorCode: 555 }))).toBe(true);
  });

  test.for([
    'Client version missing or invalid',
    'aid Missing or Invalid',
  ])('Counts the error response "%s" as permanent', (errorText) => {
    expect(AniDbErrorClassifier.isTransient(AniDbResponseError.create({ errorText, errorCode: 302 }))).toBe(false);
  });

  test.for([429, 500, 503])('Counts the API status %i as transient', (statusCode) => {
    expect(AniDbErrorClassifier.isTransient(AniDbApiError.createForUnexpectedHttpStatusCode(statusCode, 'Service Unavailable'))).toBe(true);
  });

  test.for([403, 404])('Counts the API status %i as permanent', (statusCode) => {
    expect(AniDbErrorClassifier.isTransient(AniDbApiError.createForUnexpectedHttpStatusCode(statusCode, 'Forbidden'))).toBe(false);
  });

  test('Counts a response that is not an anime as permanent', () => {
    expect(AniDbErrorClassifier.isTransient(AniDbApiError.createForUnexpectedAnimeResponse('<html>maintenance</html>'))).toBe(false);
  });

  test('Counts a CDN server error as transient', () => {
    expect(AniDbErrorClassifier.isTransient(AniDbCdnError.createForUnexpectedHttpStatusCode(502, 'Bad Gateway'))).toBe(true);
  });

  test('Counts a missing CDN image as permanent', () => {
    expect(AniDbErrorClassifier.isTransient(AniDbCdnError.createForNotFoundResponse('294282.jpg'))).toBe(false);
  });

  test.for([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
  ])('Counts the network failure %s as transient', (code) => {
    expect(AniDbErrorClassifier.isTransient(createNetworkError(code))).toBe(true);
  });

  test('Counts an error with an unrelated code as permanent', () => {
    expect(AniDbErrorClassifier.isTransient(createNetworkError('UND_ERR_INVALID_ARG'))).toBe(false);
  });

  test('Counts a programming error as permanent', () => {
    expect(AniDbErrorClassifier.isTransient(new TypeError('Cannot read properties of undefined (reading \'anime\')'))).toBe(false);
  });

  test('Counts a thrown non-error as permanent', () => {
    expect(AniDbErrorClassifier.isTransient(null)).toBe(false);
  });
});
