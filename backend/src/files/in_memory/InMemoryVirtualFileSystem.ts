import type ApolloUser from '../../user/ApolloUser.js';
import VirtualFileSystem, { type CommonVirtualFileSystemOptions } from '../VirtualFileSystem.js';
import type WriteableVirtualFile from '../WriteableVirtualFile.js';
import InMemoryFile from './InMemoryFile.js';
import WriteableInMemoryFile from './WriteableInMemoryFile.js';

export default class InMemoryVirtualFileSystem extends VirtualFileSystem {
  private readonly files = new Map<string, InMemoryFile>();

  constructor(
    public readonly id: string,
    public readonly owner: ApolloUser | null,
    protected readonly options: CommonVirtualFileSystemOptions,
  ) {
    super(id, owner, options);
  }

  getFile(path: string): InMemoryFile {
    let file = this.files.get(path);
    if (file == null) {
      file = new InMemoryFile(this, path);
      this.files.set(path, file);
    }

    return file;
  }

  getWriteableFile(file: InMemoryFile): WriteableVirtualFile<InMemoryFile> {
    if (file.fileSystem !== this) {
      throw new Error(`Cannot create a Writeable-File for another file system`);
    }
    return new WriteableInMemoryFile(file);
  }
}
