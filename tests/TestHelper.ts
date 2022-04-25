import IUserFileSystem from '../src/files/filesystems/IUserFileSystem';

export default class TestHelper {
  static async createEmptyFile(path: string, fileSystem: IUserFileSystem): Promise<void> {
    await fileSystem.acquireLock(null as any, fileSystem.getFile(path), async (writeableFile) => {
      await writeableFile.write('');
    });
  }
}
