import Path from 'path';
import AbstractUser from '../../../src/AbstractUser';
import UserFileSystem from '../../../src/files/filesystems/UserFileSystem';
import UserStorage from '../../../src/UserStorage';
import TestHelper from '../../TestHelper';

let user: AbstractUser;
beforeEach(async () => {
  user = await new UserStorage().createUser('Jester');
});

describe('Constructor input validation', () => {
  test('Instantiate with relative path', () => {
    expect(() => new UserFileSystem(user, 'test')).toThrowError('rootOnHost must be an absolute path');
  });

  test('Instantiate with absolute path', async () => {
    expect(() => new UserFileSystem(user, user.getDefaultFileSystem().getAbsolutePathOnHost())).not.toThrowError();

    const fileSystem = new UserFileSystem(user, Path.join(user.getDefaultFileSystem().getAbsolutePathOnHost(), 'non-existing'));
    await expect(fileSystem.getFile('/').exists()).resolves.toBe(true);
  });

  test('Instantiate with absolute path to existing text file', async () => {
    await TestHelper.createFile(user.getDefaultFileSystem(), '/test.txt');

    const testFile = user.getDefaultFileSystem().getFile('/test.txt');
    const testFileAbsolutePathOnHost = testFile.getAbsolutePathOnHost() as string;

    await expect(testFile.exists()).resolves.toBe(true);

    expect(() => new UserFileSystem(user, testFileAbsolutePathOnHost))
      .toThrowError(`The given 'rootOnHost' already exists and is not a directory`);
  });
});

describe('#getFile', () => {
  test.each([
    '/test.txt', '/Test.txt',
    '/dir', '/dir/Sub:!', '/C:\\\\Users\\Jester\\'
  ])('UserFile constructor inputs unmodified', (path) => {
    const userFile = user.getDefaultFileSystem().getFile(path);

    expect(userFile.getPath()).toBe(path);
    expect(userFile.getOwner()).toBe(user);
    expect(userFile.getFileSystem()).toBe(user.getDefaultFileSystem());
  });

  test('#getFile with relative path', () => {
    expect(() => user.getDefaultFileSystem().getFile('test')).toThrowError('Path must be absolute');
  });

  test('#getFile with trailing slash', () => {
    expect(user.getDefaultFileSystem().getFile('/dir/').getPath()).toBe('/dir');
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
    await expect(user.getDefaultFileSystem().getFiles('/')).resolves.toHaveLength(2);

    await expect(user.getDefaultFileSystem().getFiles('/sub/')).resolves.toHaveLength(1);
  });

  test('For non existing path', async () => {
    await expect(user.getDefaultFileSystem().getFiles('/sub-non-existing/')).rejects.toThrowError();
  });

  test('For existing text file', async () => {
    await expect(user.getDefaultFileSystem().getFiles('/root.txt')).rejects.toThrowError();
  });
});

describe('#getSize', () => {
  test('Size of empty directory', async () => {
    await expect(user.getDefaultFileSystem().getFiles('/')).resolves.toHaveLength(0);

    // Actual size depends on file system etc.
    const emptyFileSystemSize = user.getDefaultFileSystem().getSize();
    await expect(emptyFileSystemSize).resolves.toBeGreaterThanOrEqual(0);
    await expect(emptyFileSystemSize).resolves.toBeLessThanOrEqual(8);
  });

  test('Size of directory with text file', async () => {
    const emptyFileSystemSize = await user.getDefaultFileSystem().getSize();

    await TestHelper.createFile(user.getDefaultFileSystem(), '/root.txt', 'Hello Jester!');
    await expect(user.getDefaultFileSystem().getFiles('/')).resolves.toHaveLength(1);

    await expect(user.getDefaultFileSystem().getSize()).resolves.toBeGreaterThan(emptyFileSystemSize);
  });
});
