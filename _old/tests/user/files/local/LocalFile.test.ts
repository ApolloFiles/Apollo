import Fs from 'node:fs';
import Path from 'node:path';
import FileTypeUtils from '../../../../src/FileTypeUtils';
import ApolloUser from '../../../../src/user/ApolloUser';
import ApolloUserStorage from '../../../../src/user/ApolloUserStorage';
import TestHelper from '../../../TestHelper';

let user: ApolloUser;
beforeEach(async () => {
  user = await new ApolloUserStorage().create('Jester');
});

describe('', () => {
  let mockFileTypeUtils: jest.SpyInstance;
  beforeAll(() => {
    mockFileTypeUtils = jest.spyOn(FileTypeUtils.prototype, 'getMimeType').mockImplementation(async () => 'text/mocked');
  });

  test('file system root directory', async () => {
    const fileSystem = user.getDefaultFileSystem();
    const fileSystemRoot = fileSystem.getFile('/');
    const absolutePathOnHost = fileSystemRoot.getAbsolutePathOnHost();

    expect(fileSystemRoot.fileSystem.owner).toBe(user);
    expect(fileSystemRoot.fileSystem).toBe(fileSystem);
    expect(fileSystemRoot.path).toBe('/');

    expect(typeof absolutePathOnHost).toBe('string');
    expect(Path.isAbsolute(absolutePathOnHost as string)).toBe(true);

    await expect(fileSystemRoot.isDirectory()).resolves.toBe(true);
    await expect(fileSystemRoot.isFile()).resolves.toBe(false);
    await expect(fileSystemRoot.exists()).resolves.toBe(true);

    await expect(fileSystemRoot.read()).rejects.toThrow();

    await expect(fileSystemRoot.getMimeType()).resolves.toBeNull();
    expect(mockFileTypeUtils).toHaveBeenCalledTimes(0);

    await expect(fileSystemRoot.stat()).resolves.toEqual(Fs.statSync(absolutePathOnHost as string));

    await expect(fileSystemRoot.getFiles()).resolves.toEqual([]);
  });

  test('existing file', async () => {
    const fileSystem = user.getDefaultFileSystem();
    await TestHelper.createFile(fileSystem, '/test.txt');
    const fileSystemRoot = fileSystem.getFile('/test.txt');

    await expect(fileSystemRoot.isDirectory()).resolves.toBe(false);
    await expect(fileSystemRoot.isFile()).resolves.toBe(true);
    await expect(fileSystemRoot.exists()).resolves.toBe(true);

    await expect(fileSystemRoot.getFiles()).rejects.toThrow('/test.txt is not a directory');

    await expect(fileSystemRoot.read()).resolves.toEqual(Buffer.of());

    await expect(fileSystemRoot.getMimeType()).resolves.toBe('text/mocked');
    expect(mockFileTypeUtils).toHaveBeenCalledTimes(1);
  });

  test('non existing file', async () => {
    const fileSystem = user.getDefaultFileSystem();
    const fileSystemRoot = fileSystem.getFile('/undefined');

    await expect(fileSystemRoot.isDirectory()).resolves.toBe(false);
    await expect(fileSystemRoot.isFile()).resolves.toBe(false);
    await expect(fileSystemRoot.exists()).resolves.toBe(false);

    await expect(fileSystemRoot.getFiles()).rejects.toThrow('/undefined is not a directory');

    await expect(fileSystemRoot.read()).rejects.toThrow();

    await expect(fileSystemRoot.getMimeType()).resolves.toBeNull();
    expect(mockFileTypeUtils).toHaveBeenCalledTimes(0);
  });
});

describe('#generateCacheId', () => {
  test.each(['/', '/test.txt', '/subdir/', '/subdir/test.txt'])('For %O', async (filePath) => {
    const fileSystem = user.getDefaultFileSystem();
    const fileSystemFile = fileSystem.getFile(filePath);

    await expect(fileSystemFile.exists()).resolves.toBe(filePath == '/');

    const firstCacheId = await fileSystemFile.generateCacheId(true);
    expect(firstCacheId).not.toBeNull();
    expect(firstCacheId).toBe(await fileSystemFile.generateCacheId(true));

    if (filePath.endsWith('.txt')) {
      await Fs.promises.mkdir(Path.dirname(fileSystemFile.getAbsolutePathOnHost() as string), { recursive: true });
      await Fs.promises.writeFile(fileSystemFile.getAbsolutePathOnHost() as string, 'test');
    } else {
      await Fs.promises.mkdir(fileSystemFile.getAbsolutePathOnHost() as string, { recursive: true });
      await Fs.promises.utimes(fileSystemFile.getAbsolutePathOnHost() as string, 100, 100);
    }

    await expect(fileSystemFile.exists()).resolves.toBe(true);

    const secondCacheId = await fileSystemFile.generateCacheId(true);
    expect(secondCacheId).not.toBeNull();
    expect(secondCacheId).toBe(await fileSystemFile.generateCacheId(true));

    expect(firstCacheId).not.toBe(secondCacheId);
  });
});
