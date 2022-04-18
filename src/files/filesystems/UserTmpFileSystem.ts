import Path from 'path';
import AbstractUser from '../../AbstractUser';
import { getUserStorageTmpRoot } from '../../Constants';
import UserFileSystem from './UserFileSystem';

export default class UserTmpFileSystem extends UserFileSystem {
  constructor(owner: AbstractUser) {
    super(owner, Path.join(getUserStorageTmpRoot(), owner.getId().toString()));
  }
}
