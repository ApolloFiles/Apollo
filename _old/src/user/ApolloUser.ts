import LocalFileSystem from './files/local/LocalFileSystem';
import LocalUserFileSystem from './files/local/LocalUserFileSystem';
import LocalUserTmpFileSystem from './files/local/LocalUserTmpFileSystem';
import ApolloFileUrl from './files/url/ApolloFileUrl';
import VirtualFile from './files/VirtualFile';
import VirtualFileSystem from './files/VirtualFileSystem';

export default class ApolloUser {
  public readonly id: bigint;
  public readonly displayName: string;

  constructor(id: bigint, displayName: string) {
    this.id = id;
    this.displayName = displayName;
  }

  getFileByUrl(url: ApolloFileUrl): VirtualFile {
    if (this.id.toString() !== url.apolloUserIdentifier) {
      // TODO: throw an exception when missing read permissions (http should probably return 404)
      // TODO: We probably want this method in a different class that can get the user management dependency injected
      throw new Error('Not implemented yet: getFileByUrl() for files not owned by the current user');
    }

    const fileSystem = this.getFileSystemById(BigInt(url.apolloFileSystemIdentifier));  // FIXME: identifier might not be a number
    if (fileSystem == null) {
      // TODO: throw an exception when missing read permissions (http should probably return 404)
      throw new Error('Unable to find file system with ID ' + JSON.stringify(url.apolloFileSystemIdentifier));
    }

    return fileSystem.getFile(url.apolloFilePath);
  }

  getFileSystems(): VirtualFileSystem[] {
    return [
      // TODO: read FileSystems/IDs from config/database
      new LocalUserFileSystem(1n, this, 'Trash Bin'),
      new LocalUserTmpFileSystem(2n, this, 'Temporary Files (automatically managed by Apollo)'),
      new LocalUserFileSystem(3n, this, 'Files'),
    ];
  }

  getFileSystemById(id: bigint): VirtualFileSystem | null {
    for (const fileSystem of this.getFileSystems()) {
      if (fileSystem.id === id) {
        return fileSystem;
      }
    }
    return null;
  }


  /** @deprecated This only exists to ease the transition to the new file abstraction implementation */
  getTrashBinFileSystem(): LocalFileSystem {
    return this.getFileSystemById(1n) as LocalFileSystem;
  }

  /** @deprecated This only exists to ease the transition to the new file abstraction implementation */
  getTmpFileSystem(): LocalUserTmpFileSystem {
    return this.getFileSystemById(2n) as LocalUserTmpFileSystem;
  }

  /** @deprecated This only exists to ease the transition to the new file abstraction implementation */
  getDefaultFileSystem(): LocalFileSystem {
    return this.getFileSystemById(3n) as LocalFileSystem;
  }
}
