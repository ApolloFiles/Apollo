import ApolloFileURI from '../uri/ApolloFileURI.js';
import type ApolloUser from '../user/ApolloUser.js';
import MutexManager, { type MutexAcquireOptions } from '../utils/mutex/MutexManager.js';
import type VirtualFile from './VirtualFile.js';
import WriteableVirtualFile from './WriteableVirtualFile.js';

export type CommonVirtualFileSystemOptions = {
  /**
   * If true, this file system is not (directly) exposed to the user and probably hidden in (most of) the UIs.
   */
  isInternal?: boolean;
}

export type LockHandle = {
  writeableFile: WriteableVirtualFile;
  release(): void;
};

export type LockAcquireOptions = Pick<MutexAcquireOptions, 'waitTimeoutMs' | 'leaseDurationMs'>;

export default abstract class VirtualFileSystem {
  public static readonly SYSTEM_USER_ID = 'SYSTEM';

  private readonly ID_PATTERN = /^[a-z0-9_.=@+-]+$/i;
  protected static readonly mutexManager = new MutexManager();

  /**
   * Please do not add arguments to the constructor, so Apollo can add arguments as see fit, without breaking compatibility
   * Use the options parameter instead (Prefix your options with `fs_` to avoid conflict with future options added by Apollo)
   */
  protected constructor(
    public readonly id: string,
    public readonly owner: ApolloUser | null,
    protected readonly options: CommonVirtualFileSystemOptions & Record<string, any>,
  ) {
    if (!this.ID_PATTERN.test(this.id)) {
      throw new Error(`File system IDs may only contain specific characters (${this.ID_PATTERN.toString()})`);
    }
  }

  abstract getFile(path: string): VirtualFile;

  /**
   * @internal Use {@link #acquireWriteLock} instead
   */
  abstract getWriteableFile(file: VirtualFile): WriteableVirtualFile;

  async acquireWriteLock<R>(file: VirtualFile, action: (writeableFile: WriteableVirtualFile) => R | Promise<R>, options?: LockAcquireOptions): Promise<R> {
    const lockHandle = await this.acquireWriteLockHandle(file, options);

    try {
      return await action(lockHandle.writeableFile);
    } finally {
      lockHandle.release();
    }
  }

  async acquireWriteLockHandle(file: VirtualFile, options?: LockAcquireOptions): Promise<Readonly<LockHandle>> {
    const writeableFile = this.getWriteableFile(file);

    const mutexHandle = await VirtualFileSystem
      .mutexManager
      .acquireMutexHandle(file.toURI().toString(), {
        ...options,
        onRelease: () => writeableFile.setLockHasBeenReleased(),
      });

    return {
      writeableFile,
      release: () => mutexHandle.release(),
    };
  }

  getOwnerOrThrow(): ApolloUser {
    if (this.owner == null) {
      throw new Error('The file system does not have an owner');
    }
    return this.owner;
  }

  toURI(): ApolloFileURI {
    return ApolloFileURI.create(this.owner?.id ?? VirtualFileSystem.SYSTEM_USER_ID, this.id, '/');
  }
}
