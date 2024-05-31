import Path from 'node:path';
import ApolloUser from '../../../../src/user/ApolloUser';
import ApolloUserStorage from '../../../../src/user/ApolloUserStorage';
import LocalFileSystem from '../../../../src/user/files/local/LocalFileSystem';
import TestHelper from '../../../TestHelper';

let user: ApolloUser;
beforeEach(async () => {
  user = await new ApolloUserStorage().create('Jester');
});

describe('Constructor input validation', () => {
  test('Instantiate with relative path', () => {
    expect(() => new LocalFileSystem(123n, user, 'LocalFileSystemTest', 'test')).toThrowError('pathOnHost must be an absolute path');
  });

  test('Instantiate with absolute path', async () => {
    expect(() => new LocalFileSystem(123n, user, 'LocalFileSystemTest', user.getDefaultFileSystem().getAbsolutePathOnHost())).not.toThrowError();

    const fileSystem = new LocalFileSystem(123n, user, 'LocalFileSystemTest', Path.join(user.getDefaultFileSystem().getAbsolutePathOnHost(), 'non-existing'));
    await expect(fileSystem.getFile('/').exists()).resolves.toBe(true);
  });
});

describe('#getFile', () => {
  test.each([
    '/test.txt', '/Test.txt',
    '/dir', '/dir/Sub:!', '/C:\\\\Users\\Jester\\'
  ])('UserFile constructor inputs unmodified', (path) => {
    const userFile = user.getDefaultFileSystem().getFile(path);

    expect(userFile.path).toBe(path);
    expect(userFile.fileSystem.owner).toBe(user);
    expect(userFile.fileSystem).toStrictEqual(user.getDefaultFileSystem());
  });

  test('#getFile with relative path', () => {
    expect(() => user.getDefaultFileSystem().getFile('test')).toThrowError('Path must be absolute');
  });

  test('#getFile with trailing slash', () => {
    expect(user.getDefaultFileSystem().getFile('/dir/').path).toBe('/dir');
  });

  test.each(['/..', '/../', '/.', '////', '/test/../..'])('Potentially harmful path %O', (path) => {
    const userFileAbsolutePathOnHost = user.getDefaultFileSystem().getFile(path).getAbsolutePathOnHost();
    expect(Path.normalize(userFileAbsolutePathOnHost + '/')).toBe(Path.normalize(user.getDefaultFileSystem().getAbsolutePathOnHost() + '/'));
  });
});

describe('List files for a given path', () => {
  beforeEach(async () => {
    await TestHelper.createFile(user.getDefaultFileSystem(), '/root.txt');
    await TestHelper.createFile(user.getDefaultFileSystem(), '/sub/file.txt');
  });

  test('For existing directory', async () => {
    await expect(user.getDefaultFileSystem().getFile('/').getFiles()).resolves.toHaveLength(2);

    await expect(user.getDefaultFileSystem().getFile('/sub/').getFiles()).resolves.toHaveLength(1);
  });

  test('For non existing path', async () => {
    await expect(user.getDefaultFileSystem().getFile('/sub-non-existing/').getFiles()).rejects.toThrowError();
  });

  test('For existing text file', async () => {
    await expect(user.getDefaultFileSystem().getFile('/root.txt').getFiles()).rejects.toThrowError();
  });
});

describe('#getSize', () => {
  test('Size of empty directory', async () => {
    await expect(user.getDefaultFileSystem().getFile('/').getFiles()).resolves.toHaveLength(0);

    // Actual size depends on file system etc.
    const emptyFileSystemSize = user.getDefaultFileSystem().getFile('/').getSize();
    await expect(emptyFileSystemSize).resolves.toBeGreaterThanOrEqual(0);
    await expect(emptyFileSystemSize).resolves.toBeLessThanOrEqual(8);
  });

  test('Size of directory with text file', async () => {
    const emptyFileSystemSize = await user.getDefaultFileSystem().getFile('/').getSize();

    await TestHelper.createFile(user.getDefaultFileSystem(), '/root.txt', 'Hello Jester!');
    await expect(user.getDefaultFileSystem().getFile('/').getFiles()).resolves.toHaveLength(1);

    await expect(user.getDefaultFileSystem().getFile('/').getSize()).resolves.toBeGreaterThan(emptyFileSystemSize);
  });
});
