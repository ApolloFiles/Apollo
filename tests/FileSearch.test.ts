import AbstractUser from '../src/AbstractUser';
import FileSearch from '../src/FileSearch';
import UserStorage from '../src/UserStorage';
import TestHelper from './TestHelper';

describe('Test file search', () => {
  let user: AbstractUser;
  beforeAll(async () => {
    user = await new UserStorage().createUser('Jester');

    await TestHelper.createFile(user.getDefaultFileSystem(), '/img1.png');
    await TestHelper.createFile(user.getDefaultFileSystem(), '/img2.png');
    await TestHelper.createFile(user.getDefaultFileSystem(), '/img3.png');
    await TestHelper.createFile(user.getDefaultFileSystem(), '/dir1/dir2/img4.png');

    await TestHelper.createFile(user.getTrashBinFileSystem(), '/dir1/dir2/img5.png');
  });

  test.each(['.png', 'png', 'img'])('Test file search in default file system for %O', async (query) => {
    const searchResult = await FileSearch.searchFile(user.getDefaultFileSystem().getFile('/'), query);

    expect(searchResult.length).toBe(4);
    expect(searchResult.map(value => value.getPath())).toEqual(['/dir1/dir2/img4.png', '/img1.png', '/img2.png', '/img3.png']);
  });

  test.each(['.png', 'png', 'img'])('Test file search in trash bin for %O', async (query) => {
    const searchResult = await FileSearch.searchFile(user.getTrashBinFileSystem().getFile('/'), query);

    expect(searchResult.length).toBe(1);
    expect(searchResult.map(value => value.getPath())).toEqual(['/dir1/dir2/img5.png']);
  });

  test.each([
    ['dir', 2],
    ['dir1', 1],
    ['dir2', 1],
    ['dir3', 0]
  ])('Test file search in default file system for %O', async (query, expectedLength) => {
    const searchResult = await FileSearch.searchFile(user.getDefaultFileSystem().getFile('/'), query);

    expect(searchResult.length).toBe(expectedLength);
  });

  test('Test for non directory start file', async () => {
    const searchResult = FileSearch.searchFile(user.getDefaultFileSystem().getFile('/img1.png'), '.png');
    await expect(searchResult).rejects.toThrowError('File is not a directory');
  });

  test.each([
    [() => user.getDefaultFileSystem(), 6],
    [() => user.getTrashBinFileSystem(), 3]
  ])('Search in file systems with empty string', async (fileSystemProvider, expectedLength) => {
    const searchResult = await FileSearch.searchFile(fileSystemProvider().getFile('/'), '');

    expect(searchResult.length).toBe(expectedLength);
  });
});
