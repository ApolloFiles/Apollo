import { singleton } from 'tsyringe';
import type ApolloFileURI from '../uri/ApolloFileURI.js';
import type ApolloUser from '../user/ApolloUser.js';
import FileSystemProvider from './FileSystemProvider.js';
import type VirtualFile from './VirtualFile.js';

@singleton()
export default class FileProvider {
  constructor(
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async provideForUserByUri(user: ApolloUser, uri: ApolloFileURI): Promise<VirtualFile> {
    if (user.id !== uri.userId) {
      // Right now, Apollo has no file sharing between users implemented
      throw new Error('User does not have access to the requested file, or it does not exist');
    }

    const allFileSystems = await this.fileSystemProvider.provideForUser(user);
    const fileSystem = allFileSystems.user.find(fs => fs.id === uri.fileSystemId);
    if (fileSystem == null) {
      throw new Error('User does not have access to the requested file, or it does not exist');
    }

    return fileSystem.getFile(uri.filePath);
  }
}
