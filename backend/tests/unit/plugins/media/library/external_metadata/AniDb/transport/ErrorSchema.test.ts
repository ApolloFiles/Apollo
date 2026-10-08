import {
  ERROR_RESPONSE_SCHEMA,
  LOOKS_LIKE_ERROR_RESPONSE,
} from '#src/plugins/official/media/library/external_metadata/AniDb/transport/ErrorSchema.js';

describe('ErrorSchema', () => {
  describe('LOOKS_LIKE_ERROR_RESPONSE', () => {
    test.for([
      { kind: 'a plain error body', body: '<error code="500">banned</error>' },
      { kind: 'an error body with an xml declaration', body: '<?xml version="1.0" encoding="UTF-8"?><error code="500">banned</error>' },
      { kind: 'a self-closing error body', body: '<error/>' },
      { kind: 'an error body with leading whitespace', body: '\n  <error>Anime not found</error>' },
    ])('Matches $kind', ({ body }) => {
      expect(LOOKS_LIKE_ERROR_RESPONSE.test(body)).toBe(true);
    });

    test.for([
      { kind: 'a regular anime response', body: '<?xml version="1.0" encoding="UTF-8"?><anime id="1"><type>TV Series</type></anime>' },
      { kind: 'an error element nested in a regular response', body: '<anime><error>nested</error></anime>' },
      { kind: 'an empty body', body: '' },
      { kind: 'an element that merely starts with "error"', body: '<errorlist></errorlist>' },
    ])('Does not match $kind', ({ body }) => {
      expect(LOOKS_LIKE_ERROR_RESPONSE.test(body)).toBe(false);
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

    test.for([
      { kind: 'an error without any text', input: { error: { '#text': '' } } },
      { kind: 'a non-numeric error code', input: { error: { '#text': 'banned', '@_code': 'five hundred' } } },
      { kind: 'an unknown key next to the error', input: { error: { '#text': 'banned' }, anime: { '#text': '' } } },
      { kind: 'an unknown attribute on the error', input: { error: { '#text': 'banned', '@_reason': 'flood' } } },
    ])('Rejects $kind', ({ input }) => {
      expect(ERROR_RESPONSE_SCHEMA.safeParse(input).success).toBe(false);
    });
  });
});
