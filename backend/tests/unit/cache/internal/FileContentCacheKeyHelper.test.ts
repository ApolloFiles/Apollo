import { FileContentCacheKeyHelper } from '#src/cache/internal/FileContentCacheKeyHelper.js';
import LocalFileSystem from '#src/files/local/LocalFileSystem.js';

const fileSystem = new LocalFileSystem('default', null, { fs_local: { pathOnHost: '/srv/apollo/users/kD8fQ2mXv7LpR4tN9wZ/fs/default' } });

describe(FileContentCacheKeyHelper, () => {
  describe('toGroupKey', () => {
    test('Joins the file system id and the path with a colon', () => {
      expect(FileContentCacheKeyHelper.toGroupKey(fileSystem.getFile('/movies/Arrival (2016)/Arrival.mkv'))).toBe('default:/movies/Arrival (2016)/Arrival.mkv');
    });

    test('Keeps colons and pipes in the path as they are', () => {
      expect(FileContentCacheKeyHelper.toGroupKey(fileSystem.getFile('/series/Re:Zero | Season 2/E01.mkv'))).toBe('default:/series/Re:Zero | Season 2/E01.mkv');
    });

    test('Uses the normalized path, without a trailing slash', () => {
      expect(FileContentCacheKeyHelper.toGroupKey(fileSystem.getFile('/movies//Arrival (2016)/'))).toBe('default:/movies/Arrival (2016)');
    });
  });

  describe('parseGroupKey', () => {
    test('Splits a group key into the file system id and the path', () => {
      expect(FileContentCacheKeyHelper.parseGroupKey('default:/movies/Arrival (2016)/Arrival.mkv')).toEqual({ fileSystemId: 'default', path: '/movies/Arrival (2016)/Arrival.mkv' });
    });

    test('Splits at the first colon, keeping colons in the path', () => {
      expect(FileContentCacheKeyHelper.parseGroupKey('default:/series/Re:Zero | Season 2/E01.mkv')).toEqual({ fileSystemId: 'default', path: '/series/Re:Zero | Season 2/E01.mkv' });
    });
  });

  describe('toEntryKey', () => {
    test('Appends the entry name to the group key with a pipe', () => {
      expect(FileContentCacheKeyHelper.toEntryKey(fileSystem.getFile('/movies/Arrival.mkv'), 'thumbnail.avif')).toBe('default:/movies/Arrival.mkv|thumbnail.avif');
    });

    test.for([
      { entryName: '' },
      { entryName: 'AVIF' },
      { entryName: 'thumbnail|avif' },
      { entryName: '.avif' },
      { entryName: 'thumbnail avif' },
    ])('Rejects the entry name "$entryName"', ({ entryName }) => {
      expect(() => FileContentCacheKeyHelper.toEntryKey(fileSystem.getFile('/movies/Arrival.mkv'), entryName)).toThrow(`Invalid cache entry name '${entryName}'`);
    });
  });
});
