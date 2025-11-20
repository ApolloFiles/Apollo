import Crypto from 'node:crypto';
import Fs from 'node:fs';
import type LocalFile from '../local/LocalFile.js';
import type LocalFileSystem from '../local/LocalFileSystem.js';
import type VirtualFile from '../VirtualFile.js';
import VirtualFileSystem, { type LockAcquireOptions } from '../VirtualFileSystem.js';
import type WriteableVirtualFile from '../WriteableVirtualFile.js';

// TODO: See if having a cache-dir works with this abstraction.
//       Would be nice if something like media could have a directory with n images in there etc.
// TODO: Clear/Delete should probably make sure there's no write lock on any file (or acquire a lock on the whole fs)
export default class ApolloUserCacheFileSystem {
  private readonly ID_PATTERN = /^[a-z0-9_.=@+-]+$/i;

  constructor(
    // TODO: Support 'VirtualFileSystem' in the future for more flexibility
    //       But limiting to LocalFileSystem makes some stuff easier right now, while VirtualFileSystems are not 100 % figured out yet
    private cacheFileSystem: LocalFileSystem,
  ) {
  }

  async getForFile(file: VirtualFile, identifier: string): Promise<VirtualFile> {
    if (!this.ID_PATTERN.test(identifier)) {
      throw new Error(`Cache identifier may only contain specific characters (${this.ID_PATTERN.toString()})`);
    }

    if (!(await this.isCacheStillUpToDate(file))) {
      await this.deleteForFile(file);
    }

    return this.cacheFileSystem.getFile(`${this.createCachePathForFile(file)}/${identifier}`);
  }

  async acquireWriteLockForFile<R>(file: VirtualFile, identifier: string, action: (writeableFile: WriteableVirtualFile<VirtualFile>) => R | Promise<R>, options?: LockAcquireOptions): Promise<R> {
    const cacheFile = await this.getForFile(file, identifier) as LocalFile;
    return await this.cacheFileSystem.acquireWriteLock(cacheFile, action, options);
  }

  public async getWriteableForFile(file: VirtualFile, identifier: string): Promise<WriteableVirtualFile<VirtualFile>> {
    const cacheFile = await this.getForFile(file, identifier) as LocalFile;
    return this.cacheFileSystem.acquireWriteLock(cacheFile, async (writeableFile) => writeableFile);
  }

  async moveForFile(oldFile: VirtualFile, newFile: VirtualFile): Promise<void> {
    const oldCacheDir = this.createCachePathForFile(oldFile);
    const newCacheDir = this.createCachePathForFile(newFile);
    const oldCacheDirVirtualFile = this.cacheFileSystem.getFile(oldCacheDir);
    const newCacheDirVirtualFile = this.cacheFileSystem.getFile(newCacheDir);

    await this.deleteForFile(newFile);
    await Fs.promises.rename(
      oldCacheDirVirtualFile.getAbsolutePathOnHost(),
      newCacheDirVirtualFile.getAbsolutePathOnHost(),
    );
  }

  async deleteForFile(file: VirtualFile): Promise<void> {
    const cacheDir = this.cacheFileSystem.getFile(this.createCachePathForFile(file));
    await Fs.promises.rm(cacheDir.getAbsolutePathOnHost(), { recursive: true, force: true });
  }

  async clearForFileSystem(fileSystem: VirtualFileSystem): Promise<void> {
    const cacheDir = this.cacheFileSystem.getFile(this.createCachePathForFileSystem(fileSystem));
    await Fs.promises.rm(cacheDir.getAbsolutePathOnHost(), { recursive: true, force: true });
  }

  async clear(): Promise<void> {
    await Fs.promises.rm(this.cacheFileSystem.getAbsolutePathOnHost(), { recursive: true, force: true });
  }

  private async isCacheStillUpToDate(file: VirtualFile): Promise<boolean> {
    const cacheStatFile = this.cacheFileSystem.getFile(`${this.createCachePathForFile(file)}.stat`);
    if (!(await cacheStatFile.exists())) {
      return true;
    }

    const [cacheStatValue, fileStat] = await Promise.all([
      cacheStatFile.read(),
      file.stat(),
    ]);

    return Buffer.from(`${fileStat.size};${fileStat.mtimeMs}`).equals(cacheStatValue);
  }

  private createCachePathForFile(file: VirtualFile): string {
    const filePathHash = this.calculateHash(file.path);
    const pathSegment1 = filePathHash.slice(0, 2);
    const pathSegment2 = filePathHash.slice(2, 4);
    const pathSegment3 = filePathHash.slice(4);

    return `${this.createCachePathForFileSystem(file.fileSystem)}/${pathSegment1}/${pathSegment2}/${pathSegment3}`;
  }

  private createCachePathForFileSystem(fileSystem: VirtualFileSystem): string {
    return `/fs/${fileSystem.id}`;
  }

  private calculateHash(input: string): string {
    return Crypto
      .createHash('sha256')
      .update(input)
      .digest('hex');
  }
}
