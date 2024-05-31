import Path from 'node:path';
import { getUserStorageRoot } from '../../../Constants';
import ApolloUser from '../../ApolloUser';
import LocalFileSystem from './LocalFileSystem';

export default class LocalUserFileSystem extends LocalFileSystem {
  constructor(id: bigint, owner: ApolloUser, displayName: string) {
    super(id, owner, displayName, Path.join(getUserStorageRoot(), owner.id.toString(), 'fs_' + id.toString(), '/'));
  }
}
