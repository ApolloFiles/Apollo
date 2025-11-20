import Path from 'node:path';
import type ApolloUser from '../../user/ApolloUser.js';
import VirtualFileSystem, { type CommonVirtualFileSystemOptions } from '../VirtualFileSystem.js';
import type WriteableVirtualFile from '../WriteableVirtualFile.js';
import LocalFile from './LocalFile.js';
import WriteableLocalFile from './WriteableLocalFile.js';

export type LocalFileSystemOptions = CommonVirtualFileSystemOptions & {
  fs_local: {
    pathOnHost: string,
  }
};

export default class LocalFileSystem extends VirtualFileSystem {
  constructor(
    public readonly id: string,
    public readonly owner: ApolloUser,
    protected readonly options: LocalFileSystemOptions,
  ) {
    super(id, owner, options);
    if (!Path.isAbsolute(this.options.fs_local.pathOnHost)) {
      // TODO: Proper Exception class
      throw new Error('pathOnHost must be an absolute path');
    }
  }

  getFile(path: string): LocalFile {
    return new LocalFile(this, path);
  }

  getWriteableFile(file: LocalFile): WriteableVirtualFile<LocalFile> {
    if (file.fileSystem !== this) {
      throw new Error(`Cannot create a Writeable-File for another file system`);
    }
    return new WriteableLocalFile(file);
  }

  public getAbsolutePathOnHost(): string {
    return this.options.fs_local.pathOnHost;
  }
}
