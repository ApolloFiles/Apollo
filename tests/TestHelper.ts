import IUserFileSystem from '../src/files/filesystems/IUserFileSystem';

export default class TestHelper {
  static async createFile(fileSystem: IUserFileSystem, path: string, content?: string | Buffer): Promise<void> {
    await fileSystem.acquireLock(null as any, fileSystem.getFile(path), async (writeableFile) => {
      await writeableFile.write(content ?? '');
    });
  }
}
