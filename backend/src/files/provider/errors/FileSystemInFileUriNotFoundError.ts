import type VirtualFileSystem from '../../VirtualFileSystem.js';

export default class FileSystemInFileUriNotFoundError extends Error {
  override name = this.constructor.name;

  static create(fileSystemId: VirtualFileSystem['id']): FileSystemInFileUriNotFoundError {
    return new FileSystemInFileUriNotFoundError(`Cannot find the user's file system in URI by ID: ${fileSystemId}`);
  }
}
