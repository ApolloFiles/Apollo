import Fs from 'node:fs';
import Path from 'node:path';
import { getUserStorageTmpRoot } from '../../../Constants';
import ApolloUser from '../../ApolloUser';
import LocalFile from './LocalFile';
import LocalFileSystem from './LocalFileSystem';

export default class LocalUserTmpFileSystem extends LocalFileSystem {
  constructor(id: bigint, owner: ApolloUser, displayName: string) {
    super(id, owner, displayName, Path.join(getUserStorageTmpRoot(), owner.id.toString(), '/'));
  }

  async createTmpDir(prefix?: string): Promise<LocalFile> {
    const tmpDirAbsolutePathOnHost = await Fs.promises.mkdtemp(Path.join(this.getAbsolutePathOnHost(), prefix ?? ''));

    return this.getFile(Path.join('/', Path.relative(this.getAbsolutePathOnHost(), tmpDirAbsolutePathOnHost)));
  }
}
