import Path from 'node:path';
import { singleton } from 'tsyringe';
import ApolloDirectoryProvider from '../config/ApolloDirectoryProvider.js';
import ApolloUser from '../user/ApolloUser.js';
import NodeFsUtils from '../utils/NodeFsUtils.js';
import LocalFileSystem from './local/LocalFileSystem.js';
import type VirtualFileSystem from './VirtualFileSystem.js';

// TODO: I feel like there is the need for another abstraction/wrapping layer
//       Like the VirtualFileSystem is the access to the actual FS but there needs to be a wrapping ApolloFileSystem or something
//       that knows some metadata about the FS (displayName?, internal-only (e.g. _tmp), hiddenFromUser (like _tmp), etc.)
//       This could also allow for multiple file systems to co-exist 'within' one directory
//       (e.g. /_google-drive/ is kind-of a symlink to another VFS but everything else is a local FS)

type FileSystemResponse = {
  trashBin: VirtualFileSystem,
  tmp: VirtualFileSystem,
  user: VirtualFileSystem[],
}

@singleton()
export default class FileSystemProvider {
  constructor(
    private readonly apolloDirectoryProvider: ApolloDirectoryProvider,
  ) {
  }

  async provideForUser(user: ApolloUser): Promise<FileSystemResponse> {
    const fileSystemBaseDir = this.apolloDirectoryProvider.getUserFileSystemDirectory(user.id);

    return {
      trashBin: new LocalFileSystem('_trash', user, Path.join(fileSystemBaseDir, '_trash')),
      tmp: new LocalFileSystem('_tmp', user, Path.join(fileSystemBaseDir, '_tmp')),
      user: await this.findLocalFileSystems(user, fileSystemBaseDir),
    };
  }

  private async findLocalFileSystems(user: ApolloUser, fileSystemBaseDir: string): Promise<LocalFileSystem[]> {
    return (await NodeFsUtils.readdirWithTypesIfExists(fileSystemBaseDir))
      .filter((file) => file.isDirectory() && !file.name.startsWith('_'))
      .map((dir) => new LocalFileSystem(dir.name, user, Path.join(fileSystemBaseDir, dir.name)));
  }
}
