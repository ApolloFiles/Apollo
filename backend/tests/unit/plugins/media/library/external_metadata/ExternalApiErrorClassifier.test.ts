import { ExternalApiErrorClassifier } from '#src/plugins/official/media/library/external_metadata/ExternalApiErrorClassifier.js';

function createNetworkError(code: string): Error {
  return Object.assign(new Error(`connect ${code} 203.0.113.17:443`), { code });
}

describe(ExternalApiErrorClassifier, () => {
  test.for([429, 500, 502, 503])('Counts the HTTP status %i as transient', (statusCode) => {
    expect(ExternalApiErrorClassifier.isTransientHttpStatus(statusCode)).toBe(true);
  });

  test.for([400, 401, 403, 404])('Counts the HTTP status %i as permanent', (statusCode) => {
    expect(ExternalApiErrorClassifier.isTransientHttpStatus(statusCode)).toBe(false);
  });

  test.for([
    'EAI_AGAIN',
    'ECONNRESET',
    'ETIMEDOUT',
    'UND_ERR_SOCKET',
  ])('Counts the network failure %s as transient', (code) => {
    expect(ExternalApiErrorClassifier.isTransientNetworkError(createNetworkError(code))).toBe(true);
  });

  test('Counts an error with an unrelated code as permanent', () => {
    expect(ExternalApiErrorClassifier.isTransientNetworkError(createNetworkError('UND_ERR_INVALID_ARG'))).toBe(false);
  });

  test('Counts an error without a code as permanent', () => {
    expect(ExternalApiErrorClassifier.isTransientNetworkError(new TypeError('fetch failed'))).toBe(false);
  });

  test('Counts a thrown non-error as permanent', () => {
    expect(ExternalApiErrorClassifier.isTransientNetworkError(null)).toBe(false);
  });
});
