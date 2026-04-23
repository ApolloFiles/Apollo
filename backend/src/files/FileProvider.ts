import { singleton } from 'tsyringe';
import type ApolloFileURI from '../uri/ApolloFileURI.js';
import type ApolloUser from '../user/ApolloUser.js';
import UserProvider from '../user/UserProvider.js';
import FileSystemProvider from './FileSystemProvider.js';
import type VirtualFile from './VirtualFile.js';

@singleton()
export default class FileProvider {
  constructor(
    private readonly userProvider: UserProvider,
    private readonly fileSystemProvider: FileSystemProvider,
  ) {
  }

  async provideForUserByUri(user: ApolloUser, uri: ApolloFileURI): Promise<VirtualFile> {
    // FIXME: This breaks media library shares right now :< (so I commented it out for now, but we need proper permission checks (and I don't want to manually do them everywhere))
//    if (user.id !== uri.userId) {
//      // Right now, Apollo has no file sharing between users implemented
//      throw new Error('User does not have access to the requested file, or it does not exist');
//    }
    if (user.id !== uri.userId) {
      console.warn('Requested a file via URI for a user, that is not the owner of that file (TODO: proper permission checks)');
    }

    const fileSystemOwner = await this.determineFileSystemOwner(user, uri);
    const allFileSystems = await this.fileSystemProvider.provideForUser(fileSystemOwner);
    const fileSystem = allFileSystems.user.find(fs => fs.id === uri.fileSystemId);
    if (fileSystem == null) {
      throw new Error('User does not have access to the requested file, or it does not exist');
    }

    return fileSystem.getFile(uri.filePath);
  }

  private async determineFileSystemOwner(user: ApolloUser, uri: ApolloFileURI): Promise<ApolloUser> {
    if (user.id === uri.userId) {
      return user;
    }

    const fetchedUser = await this.userProvider.findById(uri.userId);
    if (fetchedUser == null) {
      throw new Error('User referenced in ApolloFileURI does not exist: ' + uri.userId);
    }
    return fetchedUser;
  }
}
