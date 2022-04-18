import { Mutex } from 'async-mutex';
import express from 'express';
import * as fastDirectorySize from 'fast-directory-size';
import * as Path from 'path';
import AbstractUser from '../../AbstractUser';
import IUserFile from '../IUserFile';
import IUserFileSystem from './IUserFileSystem';
import IUserFileWriteable from '../IUserFileWriteable';
import UserFile from '../UserFile';
import UserFileWriteable from '../UserFileWriteable';

export default class UserFileSystem implements IUserFileSystem {
  private readonly owner: AbstractUser;
  private readonly rootOnHost: string;

  private readonly fileLocks: { [path: string]: Mutex } = {};
  private readonly fileLockMutex: Mutex = new Mutex();

  constructor(owner: AbstractUser, rootOnHost: string) {
    this.owner = owner;

    if (!Path.isAbsolute(rootOnHost)) {
      throw new Error('rootOnHost must be an absolute path');
    }

    this.rootOnHost = rootOnHost;
  }

  getFile(path: string): IUserFile {
    return new UserFile(this, path);
  }

  async getFiles(path: string): Promise<IUserFile[]> {
    return this.getFile(path).getFiles();
  }

  getOwner(): AbstractUser {
    return this.owner;
  }


  async getSize(): Promise<number> {
    return await fastDirectorySize.getDirectorySize(this.getAbsolutePathOnHost());
  }

  async acquireLock(req: express.Request, file: IUserFile, action: (file: IUserFileWriteable) => void | Promise<void>): Promise<void> {
    // TODO: Take parent files into consideration
    // TODO: Have an extra method to lock on directories, blocking writes to all files inside of it (recursively)
    const releaseFileMutex = await this.fileLockMutex.runExclusive(async () => {
      let fileMutex = this.fileLocks[file.getPath()];

      if (!fileMutex) {
        fileMutex = new Mutex();
        this.fileLocks[file.getPath()] = fileMutex;
      }

      return fileMutex.acquire();
    });

    await action(new UserFileWriteable(req, file));
    releaseFileMutex();
  }

  getAbsolutePathOnHost(): string {
    return this.rootOnHost;
  }
}
