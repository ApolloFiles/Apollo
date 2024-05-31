import ApolloUrl from '../../../../src/user/files/url/ApolloUrl';

test('URL with wrong protocol', () => {
  expect(() => new ApolloUrl('protocol://')).toThrow('Expected protocol to be "apollo:" but got "protocol:"');
});

describe('Valid URL with different paths', () => {
  test.each([
    ['', '', []],
    ['/', '', []],
    ['/a', 'a', ['a']],
    ['/a/', 'a', ['a']],
    ['/a/b', 'a', ['a', 'b']],
    ['/a/b/', 'a', ['a', 'b']],
    ['/Hello world.txt', 'Hello world.txt', ['Hello world.txt']],
    ['/Hello%20world.txt', 'Hello world.txt', ['Hello world.txt']],
    ['/Hello+world.txt', 'Hello+world.txt', ['Hello+world.txt']],
    ['/encoded%2Fslash', 'encoded/slash', ['encoded/slash']]
  ])('Path: %s', (urlSuffix: string, expectedUrlPrefix: string, expectedPathSegments: string[]) => {
    const url = new ApolloUrl(`apollo://${urlSuffix}`);
    expect(url.apolloUrlPrefix).toBe(expectedUrlPrefix);
    expect(url.decodedPathSegments).toEqual(expectedPathSegments);
  });
});
