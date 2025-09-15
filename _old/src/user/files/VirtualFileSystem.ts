import { Mutex } from 'async-mutex';
import express from 'express';
import UserFileWriteable from '../../files/UserFileWriteable';
import ApolloUser from '../ApolloUser';
import LocalFile from './local/LocalFile';
import ApolloFileUrl from './url/ApolloFileUrl';
import VirtualFile from './VirtualFile';

export default abstract class VirtualFileSystem {
  public readonly id: bigint;
  public readonly owner: ApolloUser;
  public readonly displayName: string;

  private readonly fileLocks: { [path: string]: Mutex } = {};
  private readonly fileLockMutex: Mutex = new Mutex();

  protected constructor(id: bigint, owner: ApolloUser, displayName: string) {
    this.id = id;
    this.owner = owner;
    this.displayName = displayName;
  }

  abstract getFile(path: string): VirtualFile;

  // TODO: This implementation is copied from the old file abstraction and should probably be rewritten
  async acquireLock(req: express.Request, file: VirtualFile, action: (file: UserFileWriteable) => void | Promise<void>): Promise<void> {
    if (!(file instanceof LocalFile)) {
      throw new Error('Not implemented yet: acquireLock() for files not stored on the local file system');
    }

    // TODO: Take parent files into consideration
    // TODO: Have an extra method to lock on directories, blocking writes to all files inside of it (recursively)
    const releaseFileMutex = await this.fileLockMutex.runExclusive(async () => {
      let fileMutex = this.fileLocks[file.path];

      if (!fileMutex) {
        fileMutex = new Mutex();
        this.fileLocks[file.path] = fileMutex;
      }

      return fileMutex.acquire();
    });

    await action(new UserFileWriteable(req, file));
    releaseFileMutex();
  }

  toUrl(): ApolloFileUrl {
    return ApolloFileUrl.create(this.owner.id, this.id, '/');
  }

  /** @deprecated This only exists to ease the transition to the new file abstraction implementation */
  getUniqueId(): string {
    return `${this.owner.id}_${this.id}`;
  }
}
