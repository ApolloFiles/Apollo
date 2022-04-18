import Path from 'path';
import AbstractUser from '../../AbstractUser';
import { getUserStorageRoot } from '../../Constants';
import UserFileSystem from './UserFileSystem';

export default class UserTrashBinFileSystem extends UserFileSystem {
  constructor(owner: AbstractUser) {
    super(owner, Path.join(getUserStorageRoot(), owner.getId().toString(), 'trash'));
  }
}
