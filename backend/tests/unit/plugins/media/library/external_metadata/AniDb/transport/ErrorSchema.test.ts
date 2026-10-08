import {
  ERROR_RESPONSE_SCHEMA,
  LOOKS_LIKE_ERROR_RESPONSE,
} from '#src/plugins/official/media/library/external_metadata/AniDb/transport/ErrorSchema.js';

describe('LOOKS_LIKE_ERROR_RESPONSE', () => {
  test('Matches an error body with and without an xml declaration', () => {
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('<error code="500">banned</error>')).toBe(true);
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('<?xml version="1.0" encoding="UTF-8"?><error code="500">banned</error>')).toBe(true);
  });

  test('Matches a self-closing and a leading-whitespace error body', () => {
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('<error/>')).toBe(true);
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('\n  <error>Anime not found</error>')).toBe(true);
  });

  test('Does not match a regular response', () => {
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>')).toBe(false);
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('<anime><error>nested</error></anime>')).toBe(false);
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('')).toBe(false);
  });

  test('Does not match an element that merely starts with "error"', () => {
    expect(LOOKS_LIKE_ERROR_RESPONSE.test('<errorlist></errorlist>')).toBe(false);
  });
});

describe('ERROR_RESPONSE_SCHEMA', () => {
  test('Flattens the parsed error into text and code', () => {
    const parsed = ERROR_RESPONSE_SCHEMA.parse({
      '?xml': { '#text': '', '@_version': '1.0' },
      error: { '#text': 'banned', '@_code': '500' },
    });

    expect(parsed).toEqual({ errorText: 'banned', errorCode: 500 });
  });

  test('Leaves the code undefined when the response carries none', () => {
    expect(ERROR_RESPONSE_SCHEMA.parse({ error: { '#text': 'Anime not found' } }))
      .toEqual({ errorText: 'Anime not found', errorCode: undefined });
  });

  test('Rejects an error without any text', () => {
    expect(ERROR_RESPONSE_SCHEMA.safeParse({ error: { '#text': '' } }).success).toBe(false);
  });

  test('Rejects a non-numeric error code', () => {
    expect(ERROR_RESPONSE_SCHEMA.safeParse({ error: { '#text': 'banned', '@_code': 'five hundred' } }).success).toBe(false);
  });

  test('Rejects unknown keys next to the error', () => {
    expect(ERROR_RESPONSE_SCHEMA.safeParse({ error: { '#text': 'banned' }, anime: { '#text': '' } }).success).toBe(false);
    expect(ERROR_RESPONSE_SCHEMA.safeParse({ error: { '#text': 'banned', '@_reason': 'flood' } }).success).toBe(false);
  });
});
