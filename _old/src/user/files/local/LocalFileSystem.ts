import Fs from 'node:fs';
import Path from 'node:path';
import ApolloUser from '../../ApolloUser';
import VirtualFileSystem from '../VirtualFileSystem';
import LocalFile from './LocalFile';

export default class LocalFileSystem extends VirtualFileSystem {
  private readonly pathOnHost: string;

  constructor(id: bigint, owner: ApolloUser, displayName: string, pathOnHost: string) {
    super(id, owner, displayName);
    this.pathOnHost = pathOnHost;
    if (!Path.isAbsolute(pathOnHost)) {
      throw new Error('pathOnHost must be an absolute path');
    }

    // TODO: improve on this, don't call it in the constructor and don't use sync
    Fs.mkdirSync(this.pathOnHost, { recursive: true });
  }

  getFile(path: string): LocalFile {
    return new LocalFile(this, path);
  }

  getAbsolutePathOnHost(): string {
    return this.pathOnHost;
  }
}
