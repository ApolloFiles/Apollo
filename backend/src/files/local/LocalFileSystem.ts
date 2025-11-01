import Fs from 'node:fs';
import Path from 'node:path';
import type ApolloUser from '../../user/ApolloUser.js';
import VirtualFileSystem from '../VirtualFileSystem.js';
import LocalFile from './LocalFile.js';

export default class LocalFileSystem extends VirtualFileSystem {
  constructor(
    id: string,
    owner: ApolloUser,
    private readonly pathOnHost: string,
  ) {
    super(id, owner);
    if (!Path.isAbsolute(pathOnHost)) {
      // TODO: Proper Exception class
      throw new Error('pathOnHost must be an absolute path');
    }
  }

  async getFile(path: string): Promise<LocalFile> {
    const file = new LocalFile(this, path);

    if (file.path === '/') {
      await Fs.promises.mkdir(file.getAbsolutePathOnHost(), { recursive: true });
    }

    return file;
  }

  public getAbsolutePathOnHost(): string {
    return this.pathOnHost;
  }
}
