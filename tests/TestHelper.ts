import VirtualFileSystem from '../src/user/files/VirtualFileSystem';

export default class TestHelper {
  static async createFile(fileSystem: VirtualFileSystem, path: string, content?: string | Buffer): Promise<void> {
    await fileSystem.acquireLock(null as any, fileSystem.getFile(path), async (writeableFile) => {
      await writeableFile.write(content ?? '');
    });
  }
}
