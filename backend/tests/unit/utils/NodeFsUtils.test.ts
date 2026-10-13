import { NodeFsUtils } from '#src/utils/NodeFsUtils.js';
import { createTemporaryTestDirectory } from '#tests/test-helpers.js';
import Fs from 'node:fs';
import Path from 'node:path';

describe(NodeFsUtils, () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTemporaryTestDirectory();
  });

  describe('nullIfMissing', () => {
    test('Resolves with the result of the operation', async () => {
      await Fs.promises.writeFile(Path.join(tmpDir, 'anidb-ban.json'), '{"reason":"flood"}');

      await expect(NodeFsUtils.nullIfMissing(Fs.promises.readFile(Path.join(tmpDir, 'anidb-ban.json'), 'utf-8'))).resolves.toBe('{"reason":"flood"}');
    });

    test('Resolves with null when the file does not exist', async () => {
      await expect(NodeFsUtils.nullIfMissing(Fs.promises.readFile(Path.join(tmpDir, 'anidb-ban.json')))).resolves.toBeNull();
    });

    test('Rejects with any other error', async () => {
      await expect(NodeFsUtils.nullIfMissing(Fs.promises.readFile(tmpDir))).rejects.toThrow(expect.objectContaining({ code: 'EISDIR' }));
    });
  });

  describe('readdirIfExists', () => {
    test('Lists the names of the directory\'s entries', async () => {
      await Fs.promises.writeFile(Path.join(tmpDir, 'Arrival.mkv'), '');
      await Fs.promises.mkdir(Path.join(tmpDir, 'Extras'));

      const names = await NodeFsUtils.readdirIfExists(tmpDir);

      expect(names.sort()).toEqual(['Arrival.mkv', 'Extras']);
    });

    test('Returns an empty list for a directory that does not exist', async () => {
      await expect(NodeFsUtils.readdirIfExists(Path.join(tmpDir, 'movies'))).resolves.toEqual([]);
    });

    test('Rejects for a path that is a file', async () => {
      await Fs.promises.writeFile(Path.join(tmpDir, 'Arrival.mkv'), '');

      await expect(NodeFsUtils.readdirIfExists(Path.join(tmpDir, 'Arrival.mkv'))).rejects.toThrow(expect.objectContaining({ code: 'ENOTDIR' }));
    });
  });

  describe('readdirWithTypesIfExists', () => {
    test('Lists the directory\'s entries with their types', async () => {
      await Fs.promises.writeFile(Path.join(tmpDir, 'Arrival.mkv'), '');
      await Fs.promises.mkdir(Path.join(tmpDir, 'Extras'));

      const entries = await NodeFsUtils.readdirWithTypesIfExists(tmpDir);

      expect(entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() })).sort((a, b) => a.name.localeCompare(b.name)))
        .toEqual([{ name: 'Arrival.mkv', isDirectory: false }, { name: 'Extras', isDirectory: true }]);
    });

    test('Returns an empty list for a directory that does not exist', async () => {
      await expect(NodeFsUtils.readdirWithTypesIfExists(Path.join(tmpDir, 'movies'))).resolves.toEqual([]);
    });
  });
});
