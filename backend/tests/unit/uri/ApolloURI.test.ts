import ApolloURI from '#src/uri/ApolloURI.js';
import InvalidApolloURIError from '#src/uri/errors/InvalidApolloURIError.js';

describe(ApolloURI, () => {
  describe(ApolloURI.parse, () => {
    test.for([
      { uri: 'apollo:///foo', expected: ['foo'] },
      { uri: 'apollo:///foo/bar', expected: ['foo', 'bar'] },
      { uri: 'apollo:///a/b/c.txt', expected: ['a', 'b', 'c.txt'] },
      { uri: 'apollo:///.gitignore', expected: ['.gitignore'] },
    ])('Splits the simple path $uri into its segments', ({ uri, expected }) => {
      expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expected);
    });

    test.for([
      { uri: 'apollo://' },
      { uri: 'apollo:///' },
    ])('Parses $uri as the root directory', ({ uri }) => {
      expect(ApolloURI.parse(uri).pathSegments).toStrictEqual([]);
    });

    test.for([
      { uri: 'apollo:///café', expected: ['café'] },
      { uri: 'apollo:///☁️', expected: ['☁️'] },
    ])('Keeps the unicode characters in $uri', ({ uri, expected }) => {
      expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expected);
    });

    test.for([
      { uri: 'apollo:///%20', expected: [' '] },
      { uri: 'apollo:///foo%20bar', expected: ['foo bar'] },
      { uri: 'apollo:///%C3%A9', expected: ['é'] },
      { uri: 'apollo:///small-hex/%c3%a9', expected: ['small-hex', 'é'] },

      { uri: 'apollo:///Question%3F', expected: ['Question?'] },
      { uri: 'apollo:///Quot%22', expected: ['Quot"'] },
      { uri: 'apollo:///Percent%25', expected: ['Percent%'] },
      { uri: 'apollo:///Tilde%7E', expected: ['Tilde~'] },
      { uri: 'apollo:///Plus%2B', expected: ['Plus+'] },
    ])('Decodes the percent encoding in $uri', ({ uri, expected }) => {
      expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expected);
    });

    test('Accepts the scheme in upper case', () => {
      expect(ApolloURI.parse('APOLLO:///foo/bar').pathSegments).toStrictEqual(['foo', 'bar']);
    });

    test('Ignores a trailing slash', () => {
      expect(ApolloURI.parse('apollo:///foo/bar/').pathSegments).toStrictEqual(['foo', 'bar']);
    });

    test('Ignores query parameters (for now)', () => {
      expect(ApolloURI.parse('apollo:///a/b/c.txt?foo=bar').pathSegments).toStrictEqual(['a', 'b', 'c.txt']);
    });

    test('Keeps a plus in the path instead of reading it as white space', () => {
      expect(ApolloURI.parse('apollo:///foo+bar').pathSegments).toStrictEqual(['foo+bar']);
    });

    // TODO: Update implementation to fix this bug
    test.skip('Preserves a new line in the path', () => {
      expect(ApolloURI.parse('apollo:///foo\nbar').pathSegments).toStrictEqual(['foo\nbar']);
    });

    test.for([
      { uri: 'garbage' },
      { uri: 'apollo://:8080/foo' },
    ])('Rejects the invalid URI $uri', ({ uri }) => {
      expect(() => ApolloURI.parse(uri)).toThrow(InvalidApolloURIError);
      expect(() => ApolloURI.parse(uri)).toThrow('Cannot parse invalid URI');
    });

    test('Rejects a URI with a scheme other than apollo', () => {
      expect(() => ApolloURI.parse('https://example.com'))
        .toThrow(new InvalidApolloURIError('Expected protocol to be "apollo:" but got "https:"'));
    });

    test.for([
      { uri: 'apollo://example.com/foo' },
      { uri: 'apollo://user:pass@example.com/foo' },
      { uri: 'apollo://user@example.com/foo' },
      { uri: 'apollo:///foo#hash' },
    ])('Rejects the host, user info or hash in $uri', ({ uri }) => {
      expect(() => ApolloURI.parse(uri))
        .toThrow(new InvalidApolloURIError('The URI contains non-empty host, username, password and/or hash components, which are expected to be empty'));
    });

    test('Rejects a percent-encoded slash', () => {
      expect(() => ApolloURI.parse('apollo:///foo%2Fbar')).toThrow(new InvalidApolloURIError('Path segments cannot contain "/"'));
    });

    test.for([
      { uri: 'apollo:///foo/./bar', expected: ['foo', 'bar'] },
      { uri: 'apollo:///foo/%2E/bar', expected: ['foo', 'bar'] },

      { uri: 'apollo:///foo/../not-foo', expected: ['not-foo'] },
      { uri: 'apollo:///foo/%2E%2E/not-foo', expected: ['not-foo'] },
    ])('Silently normalizes the POSIX dot file names in $uri (for now)', ({ uri, expected }) => {
      // This behavior is expected to change in the future and should not be relied on
      expect(ApolloURI.parse(uri).pathSegments).toStrictEqual(expected);
    });

    test.for([
      { position: 'in the middle', uri: 'apollo:///foo//baz' },
      { position: 'at the end', uri: 'apollo:///foo/baz//' },
      { position: 'at the start', uri: 'apollo:////foo/baz/' },
    ])('Rejects an empty path segment from a double slash $position', ({ uri }) => {
      expect(() => ApolloURI.parse(uri)).toThrow(new InvalidApolloURIError('Path segments cannot be empty'));
    });

    // TODO: Update implementation to fix this bug
    test.skip.for([
      { uri: 'apollo:///foo/./bar' },
      { uri: 'apollo:///foo/%2E/bar' },

      { uri: 'apollo:///foo/../not-foo' },
      { uri: 'apollo:///foo/%2E%2E/not-foo' },
    ])('Rejects the reserved POSIX dot file names in $uri', ({ uri }) => {
      expect(() => ApolloURI.parse(uri)).toThrow(new InvalidApolloURIError('Path segments cannot be "." or ".."'));
    });

    test.for([
      { uri: 'apollo:///%' },
      { uri: 'apollo:///%zz' },
    ])('Rejects the malformed percent encoding in $uri', ({ uri }) => {
      expect(() => ApolloURI.parse(uri)).toThrow(InvalidApolloURIError);
      expect(() => ApolloURI.parse(uri)).toThrow('Path segment contains malformed percent-encoding');
    });

    test('Rejects a NUL byte in the path', () => {
      expect(() => ApolloURI.parse('apollo:///%00')).toThrow(new InvalidApolloURIError('Path segments cannot contain NUL byte'));
    });
  });

  describe('toString', () => {
    test('Normalizes the scheme to lower case', () => {
      expect(ApolloURI.parse('APOLLO:///foo/bar').toString()).toBe('apollo:///foo/bar');
    });

    test('Drops a trailing slash', () => {
      expect(ApolloURI.parse('apollo:///foo/bar/').toString()).toBe('apollo:///foo/bar');
    });

    test('Renders zero path segments as the absolute root path', () => {
      expect(new ApolloURI([]).toString()).toBe('apollo:///');
    });

    test.for([
      { pathSegment: '☁️', expected: 'apollo:///%E2%98%81%EF%B8%8F' },

      { pathSegment: 'Question?', expected: 'apollo:///Question%3F' },
      { pathSegment: 'Backslash\\', expected: 'apollo:///Backslash%5C' },
      { pathSegment: 'Newline\n', expected: 'apollo:///Newline%0A' },
      { pathSegment: 'Colon:', expected: 'apollo:///Colon%3A' },
      { pathSegment: 'Hash#', expected: 'apollo:///Hash%23' },
    ])('Percent-encodes the special characters in $pathSegment as $expected', ({ pathSegment, expected }) => {
      expect(new ApolloURI([pathSegment]).toString()).toBe(expected);
    });

    test('Percent-encodes a plus instead of turning it into white space', () => {
      expect(new ApolloURI(['foo+bar']).toString()).toBe('apollo:///foo%2Bbar');
    });

    test('Drops query parameters', () => {
      expect(ApolloURI.parse('apollo:///foo/bar?test=123').toString()).toBe('apollo:///foo/bar');
    });
  });

  describe('constructor', () => {
    test('Allows zero path segments for the root path', () => {
      expect(new ApolloURI([]).pathSegments).toStrictEqual([]);
    });

    test('Rejects an empty path segment', () => {
      expect(() => new ApolloURI(['foo', '', 'bar'])).toThrow(new InvalidApolloURIError('Path segments cannot be empty'));
    });

    test.for([
      { fileName: '.' },
      { fileName: '..' },
    ])('Rejects the reserved POSIX dot file name $fileName as a path segment', ({ fileName }) => {
      expect(() => new ApolloURI([fileName])).toThrow(new InvalidApolloURIError('Path segments cannot be "." or ".."'));
    });

    test('Rejects a slash in a path segment', () => {
      expect(() => new ApolloURI(['foo/bar'])).toThrow(new InvalidApolloURIError('Path segments cannot contain "/"'));
    });

    test('Rejects a NUL byte in a path segment', () => {
      expect(() => new ApolloURI(['foo\0'])).toThrow(new InvalidApolloURIError('Path segments cannot contain NUL byte'));
    });
  });

  test('Survives a round trip from the constructor through toString and parse', () => {
    const apolloUriString = new ApolloURI(['foo bar', 'baz#', '☁️']).toString();

    const reParsedUri = ApolloURI.parse(apolloUriString);

    expect(apolloUriString).toBe('apollo:///foo%20bar/baz%23/%E2%98%81%EF%B8%8F');
    expect(reParsedUri.pathSegments).toStrictEqual(['foo bar', 'baz#', '☁️']);
  });
});
