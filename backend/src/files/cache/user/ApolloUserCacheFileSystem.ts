import Crypto from 'node:crypto';
import type LocalFile from '../../local/LocalFile.js';
import type VirtualFile from '../../VirtualFile.js';
import VirtualFileSystem, { type LockAcquireOptions } from '../../VirtualFileSystem.js';
import type WriteableVirtualFile from '../../WriteableVirtualFile.js';

// TODO: Clear/Delete should probably make sure there's no write lock on any file (or acquire a lock on the whole fs)
export default class ApolloUserCacheFileSystem {
  private readonly ID_PATTERN = /^[a-z0-9_.=@+-]+$/i;

  constructor(
    private readonly cacheFileSystem: VirtualFileSystem,
  ) {
  }

  async getForFile(file: VirtualFile, identifier: string): Promise<VirtualFile> {
    if (!this.ID_PATTERN.test(identifier)) {
      throw new Error(`Cache identifier may only contain specific characters (${this.ID_PATTERN.toString()})`);
    }

    if (!(await this.isCacheStillUpToDate(file))) {
      await this.deleteForFile(file);
    }
    await this.writeCacheStatForFileIfMissing(file);

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

    await this.cacheFileSystem.getWriteableFile(oldCacheDirVirtualFile)
      .rename(this.cacheFileSystem.getWriteableFile(newCacheDirVirtualFile));
  }

  async deleteForFile(file: VirtualFile): Promise<void> {
    const cacheDir = this.cacheFileSystem.getFile(this.createCachePathForFile(file));
    const cacheStat = this.cacheFileSystem.getFile(`${this.createCachePathForFile(file)}.stat`);
    await Promise.all([
      this.cacheFileSystem.getWriteableFile(cacheDir).delete(true),
      this.cacheFileSystem.getWriteableFile(cacheStat).delete(),
    ]);
  }

  async clearForFileSystem(fileSystem: VirtualFileSystem): Promise<void> {
    const cacheDir = this.cacheFileSystem.getFile(this.createCachePathForFileSystem(fileSystem));
    await this.cacheFileSystem.getWriteableFile(cacheDir).delete(true);
  }

  async clear(): Promise<void> {
    await this.cacheFileSystem.getWriteableFile(this.cacheFileSystem.getFile('/')).delete(true);
  }

  private async isCacheStillUpToDate(file: VirtualFile): Promise<boolean> {
    if (!(await file.exists())) {
      return false;
    }

    const cacheStatFile = this.cacheFileSystem.getFile(`${this.createCachePathForFile(file)}.stat`);
    if (!(await cacheStatFile.exists())) {
      // without a recorded state there is nothing to compare against, so the cached data cannot be
      // proven to still belong to the file (this also discards caches written before this was tracked)
      return false;
    }

    const [cacheStatValue, fileStat] = await Promise.all([
      cacheStatFile.read(),
      file.stat(),
    ]);

    return Buffer.from(`${fileStat.size};${fileStat.mtimeMs}`).equals(cacheStatValue);
  }

  /**
   * Records the file state that any data cached from now on belongs to.
   *
   * This happens *before* the caller produces its data on purpose: should the file change while that
   * data is being computed, the recorded state is the older one and the cache is discarded on the
   * next access. Computing something twice is harmless – serving data for content that no longer
   * exists is not.
   */
  private async writeCacheStatForFileIfMissing(file: VirtualFile): Promise<void> {
    const cacheStatFile = this.cacheFileSystem.getFile(`${this.createCachePathForFile(file)}.stat`);
    if ((await cacheStatFile.exists()) || !(await file.exists())) {
      return;
    }

    const fileStat = await file.stat();
    await this.cacheFileSystem
      .getWriteableFile(cacheStatFile)
      .write(Buffer.from(`${fileStat.size};${fileStat.mtimeMs}`));
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
