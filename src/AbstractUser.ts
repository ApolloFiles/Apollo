import Path from 'path';
import { getUserStorageRoot } from './Constants';
import IUserFileSystem from './files/filesystems/IUserFileSystem';
import UserFileSystem from './files/filesystems/UserFileSystem';
import UserTmpFileSystem from './files/filesystems/UserTmpFileSystem';
import UserTrashBinFileSystem from './files/filesystems/UserTrashBinFileSystem';

export default class AbstractUser {
  protected readonly id: bigint;
  protected displayName: string;

  protected defaultFileSystem: IUserFileSystem;
  protected tmpFileSystem: IUserFileSystem;
  protected trashBinFileSystem: IUserFileSystem;

  constructor(id: bigint, displayName: string) {
    this.id = id;
    this.displayName = displayName;

    this.defaultFileSystem = new UserFileSystem(this, Path.join(getUserStorageRoot(), this.id.toString(), 'files'));
    this.tmpFileSystem = new UserTmpFileSystem(this);
    this.trashBinFileSystem = new UserTrashBinFileSystem(this);
  }

  getId(): bigint {
    return this.id;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  getDefaultFileSystem(): IUserFileSystem {
    return this.defaultFileSystem;
  }

  getTmpFileSystem(): IUserFileSystem {
    return this.tmpFileSystem;
  }

  getTrashBinFileSystem(): IUserFileSystem {
    return this.trashBinFileSystem;
  }
}
