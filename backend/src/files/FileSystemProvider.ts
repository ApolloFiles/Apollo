import Path from 'node:path';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../config/ApolloDirectoryProvider.js';
import ApolloUser from '../user/ApolloUser.js';
import NodeFsUtils from '../utils/NodeFsUtils.js';
import ApolloUserCacheFileSystem from './cache/ApolloUserCacheFileSystem.js';
import LocalFileSystem from './local/LocalFileSystem.js';
import type VirtualFileSystem from './VirtualFileSystem.js';

type UserSystemFileSystems = {
//  trashBin: VirtualFileSystem,
  tmp: VirtualFileSystem,
  cache: ApolloUserCacheFileSystem,
}

type UserFileSystemResponse = UserSystemFileSystems & {
  user: VirtualFileSystem[],
}

@singleton()
export default class FileSystemProvider {
  constructor(
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
  }

  async provideForUser(user: ApolloUser): Promise<UserFileSystemResponse> {
    const fileSystemBaseDir = this.apolloDirectoryProvider.getUserFileSystemDirectory(user.id);

    return {
      ...this.provideApolloFileSystemsForUser(user),
      user: await this.findLocalFileSystems(user, fileSystemBaseDir),
    };
  }

  provideApolloFileSystemsForUser(user: ApolloUser): UserSystemFileSystems {
    return {
      // FIXME: I don't think one _trash file system works... If I delete something on an S3 fs, I can't download the file to local _trash and delete in in S3...
      //        Each file system needs to have its own concept of a trash bin and Apollo needs to be able to quickly display a (unified?) trash bin, if possible...
//      trashBin: this.createSystemLocalFileSystem(user, '_trash', false),
      tmp: this.createSystemLocalFileSystem(user, '_tmp', true),
      cache: new ApolloUserCacheFileSystem(this.createSystemLocalFileSystem(user, '_cache', true)),
    };
  }

  private async findLocalFileSystems(user: ApolloUser, fileSystemBaseDir: string): Promise<LocalFileSystem[]> {
    return (await NodeFsUtils.readdirWithTypesIfExists(fileSystemBaseDir))
      .filter((file) => file.isDirectory() && !file.name.startsWith('_'))
      .map((dir) => new LocalFileSystem(dir.name, user, { fs_local: { pathOnHost: Path.join(fileSystemBaseDir, dir.name) } }));
  }

  private createSystemLocalFileSystem(user: ApolloUser, id: string, isInternal: boolean): LocalFileSystem {
    const fileSystemBaseDir = this.apolloDirectoryProvider.getUserFileSystemDirectory(user.id);
    return new LocalFileSystem(id, user, {
      isInternal,
      fs_local: {
        pathOnHost: Path.join(fileSystemBaseDir, id),
      },
    });
  }
}
