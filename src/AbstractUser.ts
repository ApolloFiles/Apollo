import Path from 'path';
import { getUserStorageRoot } from './Constants';
import IUserFileSystem from './files/filesystems/IUserFileSystem';
import IUserTmpFileSystem from './files/filesystems/IUserTmpFileSystem';
import UserFileSystem from './files/filesystems/UserFileSystem';
import UserTmpFileSystem from './files/filesystems/UserTmpFileSystem';
import UserTrashBinFileSystem from './files/filesystems/UserTrashBinFileSystem';

export default class AbstractUser {
  protected readonly id: number;
  protected displayName: string;

  protected defaultFileSystem: IUserFileSystem;
  protected tmpFileSystem: IUserTmpFileSystem;
  protected trashBinFileSystem: IUserFileSystem;

  constructor(id: number, displayName: string) {
    this.id = id;
    this.displayName = displayName;

    this.defaultFileSystem = new UserFileSystem(this, Path.join(getUserStorageRoot(), this.id.toString(), 'files'));
    this.tmpFileSystem = new UserTmpFileSystem(this);
    this.trashBinFileSystem = new UserTrashBinFileSystem(this);
  }

  getId(): number {
    return this.id;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  getDefaultFileSystem(): IUserFileSystem {
    return this.defaultFileSystem;
  }

  getTmpFileSystem(): IUserTmpFileSystem {
    return this.tmpFileSystem;
  }

  getTrashBinFileSystem(): IUserFileSystem {
    return this.trashBinFileSystem;
  }
}
