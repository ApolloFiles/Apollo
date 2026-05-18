import { singleton } from 'tsyringe';
import type ApolloFileURI from '../../uri/ApolloFileURI.js';
import UserProvider from '../../user/UserProvider.js';
import FileSystemProvider from '../FileSystemProvider.js';
import type VirtualFile from '../VirtualFile.js';
import FileSystemInFileUriNotFoundError from './errors/FileSystemInFileUriNotFoundError.js';
import UserInFileUriNotFoundError from './errors/UserInFileUriNotFoundError.js';

@singleton()
export default class FileProvider {
  constructor(
    private readonly userProvider: UserProvider,
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  // TODO: re-code FileSystemProvider too?
  async provideByUri(uri: ApolloFileURI): Promise<VirtualFile> {
    const user = await this.userProvider.findById(uri.userId);
    if (user == null) {
      throw UserInFileUriNotFoundError.create(uri.userId);
    }

    const fileSystems = await this.fileSystemProvider.provideForUser(user);
    const fileSystem = fileSystems.user.find(fs => fs.id === uri.fileSystemId);
    if (fileSystem == null) {
      throw FileSystemInFileUriNotFoundError.create(uri.fileSystemId);
    }

    return fileSystem.getFile(uri.filePath);
  }
}
