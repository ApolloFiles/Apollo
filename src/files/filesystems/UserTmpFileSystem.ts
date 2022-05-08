import Fs from 'fs';
import Path from 'path';
import AbstractUser from '../../AbstractUser';
import { getUserStorageTmpRoot } from '../../Constants';
import IUserFile from '../IUserFile';
import IUserTmpFileSystem from './IUserTmpFileSystem';
import UserFileSystem from './UserFileSystem';

export default class UserTmpFileSystem extends UserFileSystem implements IUserTmpFileSystem {
  constructor(owner: AbstractUser) {
    super(owner, Path.join(getUserStorageTmpRoot(), owner.getId().toString()));
  }

  async createTmpDir(prefix?: string): Promise<IUserFile> {
    const tmpDirAbsolutePathOnHost = await Fs.promises.mkdtemp(Path.join(this.getAbsolutePathOnHost(), prefix ?? ''));

    return this.getFile(Path.join('/', Path.relative(this.getAbsolutePathOnHost(), tmpDirAbsolutePathOnHost)));
  }
}
