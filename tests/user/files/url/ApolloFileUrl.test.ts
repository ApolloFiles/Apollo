import ApolloFileUrl from '../../../../src/user/files/url/ApolloFileUrl';

test('URL with wrong protocol', () => {
  expect(() => new ApolloFileUrl('protocol://')).toThrow('Expected protocol to be "apollo:" but got "protocol:"');
});

describe('Valid URLs', () => {
  test.each([
    ['userId/fileSystemId/', 'userId', 'fileSystemId', '/'],
    ['123/default/test.txt', '123', 'default', '/test.txt'],
    ['123/321/sub dir/Text%23file.txt', '123', '321', '/sub dir/Text#file.txt'],
  ])('', (pathSuffix: string, expectedUserId: string, expectedFileSystemId: string, expectedFilePath: string) => {
    const url = new ApolloFileUrl(`apollo:///f/${pathSuffix}`);
    expect(url.apolloUserIdentifier).toBe(expectedUserId);
    expect(url.apolloFileSystemIdentifier).toBe(expectedFileSystemId);
    expect(url.apolloFilePath).toBe(expectedFilePath);
  });
});

describe('ApolloFileUrl.create', () => {
  test.each([
    ['123', '321', 'test.txt', 'apollo:///f/123/321/test.txt'],
    ['123', '321', '/test.txt', 'apollo:///f/123/321/test.txt'],
    ['123', '321', '/sub dir/Text#file.txt', 'apollo:///f/123/321/sub%20dir/Text%23file.txt'],
  ])('test case %#', (userId: string, fileSystemId: string, filePath: string, expectedUrl: string) => {
    const url = ApolloFileUrl.create(BigInt(userId), BigInt(fileSystemId), filePath);
    expect(url.toString()).toBe(expectedUrl);
  });
});
