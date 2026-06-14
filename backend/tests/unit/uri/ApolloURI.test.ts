import { describe, expect, test } from 'vitest';
import ApolloURI from '../../../src/uri/ApolloURI.js';

describe('ApolloURI#parse with valid URIs', () => {
  test.each([
    ['apollo:///foo', ['foo']],
    ['apollo:///foo/bar', ['foo', 'bar']],
    ['apollo:///a/b/c.txt', ['a', 'b', 'c.txt']],
    ['apollo:///.gitignore', ['.gitignore']],
  ])('Parses simple paths: %s', (uri: string, expectedPathSegments: string[]) => {
    expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expectedPathSegments);
  });

  test.each([
    'apollo://',
    'apollo:///',
  ])('Parses root directory paths: %s', (uri: string) => {
    expect(ApolloURI.parse(uri).pathSegments).toStrictEqual([]);
  });

  test.each([
    ['apollo:///café', ['café']],
    ['apollo:///☁️', ['☁️']],
  ])('Handles unicode characters: %s', (uri: string, expectedPathSegments: string[]) => {
    expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expectedPathSegments);
  });

  test.each([
    ['apollo:///%20', [' ']],
    ['apollo:///foo%20bar', ['foo bar']],
    ['apollo:///%C3%A9', ['é']],
    ['apollo:///small-hex/%c3%a9', ['small-hex', 'é']],

    ['apollo:///Question%3F', ['Question?']],
    ['apollo:///Quot%22', ['Quot"']],
    ['apollo:///Percent%25', ['Percent%']],
    ['apollo:///Tilde%7E', ['Tilde~']],
    ['apollo:///Plus%2B', ['Plus+']],
  ])('Handles percent encoding: %s', (uri: string, expectedPathSegments: string[]) => {
    expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expectedPathSegments);
  });

  test('URI scheme is case-insensitive', () => {
    expect(ApolloURI.parse('APOLLO:///foo/bar').pathSegments).toStrictEqual(['foo', 'bar']);
  });

  test('Ignores a trailing slash', () => {
    expect(ApolloURI.parse('apollo:///foo/bar/').pathSegments).toStrictEqual(['foo', 'bar']);
  });

  test('Query parameters are ignored (for now)', () => {
    expect(ApolloURI.parse('apollo:///a/b/c.txt?foo=bar').pathSegments).toStrictEqual(['a', 'b', 'c.txt']);
  });

  test('A plus in the path is not misinterpreted as white space', () => {
    expect(ApolloURI.parse('apollo:///foo+bar').pathSegments).toStrictEqual(['foo+bar']);
  });

  // TODO: Update implementation to fix this bug
  test.skip('A new line in the path is preserved', () => {
    expect(ApolloURI.parse('apollo:///foo\nbar').pathSegments).toStrictEqual(['foo\nbar']);
  });
});

describe('ApolloURI#parse with invalid URIs', () => {
  test.each([
    'garbage',
    'apollo://:8080/foo',
  ])('Throws on invalid URI: %s', (uri: string) => {
    expect(() => ApolloURI.parse(uri)).toThrow('Cannot parse invalid URI');
  });

  test('Throws on non apollo:// URI', () => {
    expect(() => ApolloURI.parse('https://example.com')).toThrow('Expected protocol to be "apollo:" but got "https:"');
  });

  test.each([
    'apollo://example.com/foo',
    'apollo://user:pass@example.com/foo',
    'apollo://user@example.com/foo',
    'apollo:///foo#hash',
  ])('Throws on non-empty URI components, that are expected to be empty', (uri: string) => {
    expect(() => ApolloURI.parse(uri))
      .toThrow('The URI contains non-empty host, username, password and/or hash components, which are expected to be empty');
  });

  test('Throws on percent-encoded slash', () => {
    expect(() => ApolloURI.parse('apollo:///foo%2Fbar')).toThrow('Path segments cannot contain "/"');
  });

  test.each([
    ['apollo:///foo/./bar', ['foo', 'bar']],
    ['apollo:///foo/%2E/bar', ['foo', 'bar']],

    ['apollo:///foo/../not-foo', ['not-foo']],
    ['apollo:///foo/%2E%2E/not-foo', ['not-foo']],
  ])('POSIX dot file names are silently normalized (for now): %s', (uri, expectedPathSegments: string[]) => {
    // This behavior is expected to change in the future and should not be relied on
    expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expectedPathSegments);
  });

  test('Throws on empty path segments (double slash)', () => {
    expect(() => ApolloURI.parse('apollo:///foo//baz')).toThrow('Path segments cannot be empty');
  });

  test('Throws on double slash at the end', () => {
    expect(() => ApolloURI.parse('apollo:///foo/baz//')).toThrow('Path segments cannot be empty');
  });

  test('Throws on double slash (apollo:////) at the start', () => {
    expect(() => ApolloURI.parse('apollo:////foo/baz/')).toThrow('Path segments cannot be empty');
  });

  // TODO: Update implementation to fix this bug
  test.skip.each([
    'apollo:///foo/./bar',
    'apollo:///foo/%2E/bar',

    'apollo:///foo/../not-foo',
    'apollo:///foo/%2E%2E/not-foo',
  ])('Throws on reserved POSIX dot file names: %s', (uri: string) => {
    expect(() => ApolloURI.parse(uri)).toThrow('Path segments cannot be "." or ".."');
  });

  test.each([
    'apollo:///%',
    'apollo:///%zz',
  ])('Throws on invalid percent encoding: %s', (uri: string) => {
    expect(() => ApolloURI.parse(uri)).toThrow('Path segment contains malformed percent-encoding');
  });

  test('Throws on a NUL byte in path', () => {
    expect(() => ApolloURI.parse('apollo:///%00')).toThrow('Path segments cannot contain NUL byte');
  });
});

describe('ApolloURI#toString', () => {
  test('scheme is normalized to lower-case', () => {
    expect(ApolloURI.parse('APOLLO:///foo/bar').toString()).toBe('apollo:///foo/bar');
  });

  test('A trailing slash is ignored', () => {
    expect(ApolloURI.parse('apollo:///foo/bar/').toString()).toBe('apollo:///foo/bar');
  });

  test('Zero path segments are stringified to absolute root path', () => {
    expect(new ApolloURI([]).toString()).toBe('apollo:///');
  });

  test.each([
    ['☁️', 'apollo:///%E2%98%81%EF%B8%8F'],

    ['Question?', 'apollo:///Question%3F'],
    ['Backslash\\', 'apollo:///Backslash%5C'],
    ['Newline\n', 'apollo:///Newline%0A'],
    ['Colon:', 'apollo:///Colon%3A'],
    ['Hash#', 'apollo:///Hash%23'],
  ])('Special characters are percent encoded: %s', (pathSegment: string, expectedUri: string) => {
    expect(new ApolloURI([pathSegment]).toString()).toBe(expectedUri);
  });

  test('Plus symbol in path is not wrongly encoded as white space', () => {
    expect(new ApolloURI(['foo+bar']).toString()).toBe('apollo:///foo%2Bbar');
  });

  test('Query parameters are ignored', () => {
    expect(ApolloURI.parse('apollo:///foo/bar?test=123').toString()).toBe('apollo:///foo/bar');
  });
});

describe('ApolloURI constructor', () => {
  test('Allow zero path segments for a root path', () => {
    expect(new ApolloURI([]).pathSegments).toStrictEqual([]);
  });

  test('Throws on empty string path segment', () => {
    expect(() => new ApolloURI(['foo', '', 'bar'])).toThrow('Path segments cannot be empty');
  });

  test.each(['.', '..'])('Throws on reserved POSIX dot file name as path segment: %s', (fileName: string) => {
    expect(() => new ApolloURI([fileName])).toThrow('Path segments cannot be "." or ".."');
  });

  test('Throws on slash in path segment', () => {
    expect(() => new ApolloURI(['foo/bar'])).toThrow('Path segments cannot contain "/"');
  });

  test('Throws on NUL byte', () => {
    expect(() => new ApolloURI(['foo\0'])).toThrow('Path segments cannot contain NUL byte');
  });
});

test('Round trip: Constructor -> #toString -> #parse -> #toString', () => {
  const apolloUri = new ApolloURI(['foo bar', 'baz#', '☁️']);
  const apolloUriString = apolloUri.toString();
  const reParsedUri = ApolloURI.parse(apolloUriString);

  expect(reParsedUri.toString()).toBe('apollo:///foo%20bar/baz%23/%E2%98%81%EF%B8%8F');
});
