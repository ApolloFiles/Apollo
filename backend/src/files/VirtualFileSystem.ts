import type ApolloUser from '../user/ApolloUser.js';
import type VirtualFile from './VirtualFile.js';
import type WritableVirtualFile from './WritableVirtualFile.js';

export default abstract class VirtualFileSystem {
  protected constructor(
    public readonly id: string,
    public readonly owner: ApolloUser,
  ) {
  }

  abstract getFile(path: string): Promise<VirtualFile>;

  // TODO: We need the identifier in case the same request/process wants to lock the same file twice - We want that lock to be granted, right?
  //       if yes, maybe we can put it into a/the async local storage?
  async acquireLock(transactionId: string, file: VirtualFile, action: (file: WritableVirtualFile) => void | Promise<void>): Promise<void> {
    // TODO: implement
  }
}
