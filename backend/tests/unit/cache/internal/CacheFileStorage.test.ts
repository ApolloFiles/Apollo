import { type CacheFileLocation, CacheFileStorage } from '#src/cache/internal/CacheFileStorage.js';
import type ApolloDirectoryProvider from '#src/config/ApolloDirectoryProvider.js';
import { createStrictDeepMock, createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Fs from 'node:fs';
import Path from 'node:path';

const APP_LOCATION: CacheFileLocation = {
  userId: null,
  namespace: 'anidb.anime-xml',
  version: 1,
  fileId: '3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47',
};
const USER_LOCATION: CacheFileLocation = {
  userId: 'kD8fQ2mXv7LpR4tN9wZ',
  namespace: 'media.thumbnail',
  version: 2,
  fileId: 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85',
};

describe(CacheFileStorage, () => {
  let tmpDir: string;
  let cacheRoot: string;
  let storage: CacheFileStorage;

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
    cacheRoot = Path.join(tmpDir, 'cache');

    const directoryProvider = createStrictDeepMock<ApolloDirectoryProvider>();
    directoryProvider.getCacheBaseDirectory.mockReturnValue(cacheRoot);
    storage = new CacheFileStorage(directoryProvider);
  });

  async function storeFile(location: CacheFileLocation, content: string): Promise<void> {
    const { tempPath } = await storage.allocateTemp();
    await storage.writeTemp(tempPath, Buffer.from(content));
    await storage.moveIntoPlace(tempPath, location);
  }

  describe('temp files', () => {
    test('Allocates a temp path inside the cache root, named by its file id', async () => {
      const { fileId, tempPath } = await storage.allocateTemp();

      expect(tempPath).toBe(Path.join(cacheRoot, '.tmp', fileId));
      expect(fileId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('Creates the temp directory, so a factory can write to the temp path right away', async () => {
      const { tempPath } = await storage.allocateTemp();

      await expect(Fs.promises.writeFile(tempPath, 'ffmpeg output')).resolves.toBeUndefined();
    });

    test('Allocates a different file id on every call', async () => {
      const first = await storage.allocateTemp();
      const second = await storage.allocateTemp();

      expect(first.fileId).not.toBe(second.fileId);
    });

    test('Deleting a temp file that does not exist succeeds', async () => {
      await expect(storage.deleteTemp(Path.join(cacheRoot, '.tmp', APP_LOCATION.fileId))).resolves.toBeUndefined();
    });

    test('Clearing removes every temp file and keeps the temp directory', async () => {
      const { tempPath } = await storage.allocateTemp();
      await storage.writeTemp(tempPath, Buffer.from('left over from a crash'));

      await storage.clearTemp();

      await expect(Fs.promises.readdir(Path.join(cacheRoot, '.tmp'))).resolves.toEqual([]);
    });
  });

  describe('moving a temp file into place', () => {
    test('Stores an app entry under app/<namespace>@<version>/<first two id chars>/<file id>', async () => {
      await storeFile(APP_LOCATION, '<anime id="1"/>');

      const filePath = Path.join(cacheRoot, 'app', 'anidb.anime-xml@1', '3f', '3f2c8a4e-9b1d-4c7e-a5f0-6d8e2b1c9a47');
      await expect(Fs.promises.readFile(filePath, 'utf-8')).resolves.toBe('<anime id="1"/>');
    });

    test('Stores a user entry under user/<user id>/<namespace>@<version>/<first two id chars>/<file id>', async () => {
      await storeFile(USER_LOCATION, 'avif bytes');

      const filePath = Path.join(cacheRoot, 'user', 'kD8fQ2mXv7LpR4tN9wZ', 'media.thumbnail@2', 'c7', 'c71e0b5d-2a94-4f3c-8e6b-1d9a7f4c2e85');
      await expect(Fs.promises.readFile(filePath, 'utf-8')).resolves.toBe('avif bytes');
    });

    test('Leaves no temp file behind', async () => {
      await storeFile(APP_LOCATION, '<anime id="1"/>');

      await expect(Fs.promises.readdir(Path.join(cacheRoot, '.tmp'))).resolves.toEqual([]);
    });
  });

  describe('opening a stored file', () => {
    test('Returns a handle to the stored content', async () => {
      await storeFile(APP_LOCATION, '<anime id="1"/>');
      await using fileHandle = await storage.open(APP_LOCATION);

      await expect(fileHandle.readFile('utf-8')).resolves.toBe('<anime id="1"/>');
    });

    test('Rejects with ENOENT when the file does not exist', async () => {
      await expect(storage.open(APP_LOCATION)).rejects.toThrow(expect.objectContaining({ code: 'ENOENT' }));
    });
  });

  describe('deleting a stored file', () => {
    test('Removes the file', async () => {
      await storeFile(APP_LOCATION, '<anime id="1"/>');

      await storage.deleteFile(APP_LOCATION);

      await expect(storage.open(APP_LOCATION)).rejects.toThrow(expect.objectContaining({ code: 'ENOENT' }));
    });

    test('Succeeds when the file does not exist', async () => {
      await expect(storage.deleteFile(APP_LOCATION)).resolves.toBeUndefined();
    });
  });

  describe('the root marker', () => {
    test('Is written as .apollo-cache-root into the cache root, creating the root', async () => {
      await storage.createRootMarker();

      await expect(Fs.promises.readFile(Path.join(cacheRoot, '.apollo-cache-root'), 'utf-8')).resolves.toContain('APOLLO_CACHE_DIRECTORY');
    });

    test('Is reported once it was created', async () => {
      await storage.createRootMarker();

      await expect(storage.hasRootMarker()).resolves.toBe(true);
    });

    test('Is reported when someone else created .apollo-cache-root', async () => {
      await Fs.promises.mkdir(cacheRoot);
      await Fs.promises.writeFile(Path.join(cacheRoot, '.apollo-cache-root'), '');

      await expect(storage.hasRootMarker()).resolves.toBe(true);
    });

    test('Is reported missing in a cache root without it', async () => {
      await Fs.promises.mkdir(Path.join(cacheRoot, 'app'), { recursive: true });

      await expect(storage.hasRootMarker()).resolves.toBe(false);
    });

    test('Is reported missing when the cache root does not exist', async () => {
      await expect(storage.hasRootMarker()).resolves.toBe(false);
    });
  });

  test('Removing a user directory removes all of that user\'s files and keeps other users\' files', async () => {
    const otherUserLocation = { ...USER_LOCATION, userId: 'Xp3nV8qL2cH6sJ9bT4w', fileId: '0d4b7e21-6c8f-4a93-b2e5-7f1a9c3d8e60' };
    await storeFile(USER_LOCATION, 'avif bytes');
    await storeFile(otherUserLocation, 'other avif bytes');

    await storage.removeUserDirectory('kD8fQ2mXv7LpR4tN9wZ');

    await expect(Fs.promises.readdir(Path.join(cacheRoot, 'user'))).resolves.toEqual(['Xp3nV8qL2cH6sJ9bT4w']);
  });
});
